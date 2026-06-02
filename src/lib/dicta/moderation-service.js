import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';
import BookEdit from '@/models/BookEdit';
import User from '@/models/User';
import { applyHunks } from '@/lib/dicta/text-diff';

async function refreshPendingCount(bookId) {
  const count = await BookEdit.countDocuments({ book: bookId, status: 'pending' });
  await LibraryBook.updateOne({ _id: bookId }, { $set: { pendingCount: count } });
  return count;
}

/**
 * מחיל הצעה ש"נתפסה" כבר (status='approved', applied=false) על תוכן הספר.
 * עדכון עם CAS על version + ניסיון חוזר. קונפליקט/כשל → ההצעה מוחזרת ל-pending.
 * זוהי הליבה המשותפת ל-approveEdit ול-reconcileApprovedEdits (שחזור לאחר קריסה).
 */
async function applyClaimedEdit(edit) {
  const revertToPending = () => BookEdit.updateOne(
    { _id: edit._id },
    { $set: { status: 'pending', applied: false, reviewedBy: null, reviewerName: '', reviewedAt: null } }
  );

  if (!edit.changes?.length) {
    await BookEdit.updateOne({ _id: edit._id }, { $set: { applied: true } });
    await refreshPendingCount(edit.book);
    return { status: 'nochange' };
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const book = await LibraryBook.findById(edit.book).select('content version syncStatus');
    if (!book) {
      // הספר נמחק — אין מה להחיל; מסמנים applied כדי לא לעבד שוב לנצח
      await BookEdit.updateOne({ _id: edit._id }, { $set: { applied: true } });
      return { status: 'book-missing' };
    }

    const { content, conflicts } = applyHunks(book.content || '', edit.changes);
    if (conflicts.length > 0) {
      await revertToPending();
      await refreshPendingCount(edit.book);
      return { status: 'conflict', conflicts };
    }

    const updated = await LibraryBook.findOneAndUpdate(
      { _id: book._id, version: book.version },
      {
        $set: { content, syncStatus: book.syncStatus === 'conflict' ? 'conflict' : 'dirty' },
        $inc: { version: 1 },
      },
      { new: true }
    );
    if (updated) {
      await BookEdit.updateOne({ _id: edit._id }, { $set: { applied: true, baseVersion: updated.version - 1 } });
      await refreshPendingCount(edit.book);
      return { status: 'approved', version: updated.version };
    }
    // version השתנה במקביל — ננסה שוב על התוכן העדכני
  }

  await revertToPending();
  await refreshPendingCount(edit.book);
  throw Object.assign(new Error('עדכון מקבילי, נסה שוב'), { code: 'RETRY' });
}

/**
 * מחיל הצעה ממתינה אחת על הספר (all-or-nothing).
 *  1. "תפיסה" אטומית (pending → approved, applied:false) כך ששני מאשרים לא יעבדו עליה.
 *  2. החלה בפועל עם CAS (applyClaimedEdit). הסדר הזה מבטיח שאם התהליך קורס אחרי
 *     התפיסה ולפני applied:true — reconcileApprovedEdits ישלים/יחזיר את ההצעה.
 * @returns {Promise<{status:'approved'|'conflict'|'nochange'|'not-pending', conflicts?:Array}>}
 */
export async function approveEdit({ editId, moderatorDoc }) {
  await connectDB();

  const edit = await BookEdit.findOneAndUpdate(
    { _id: editId, status: 'pending' },
    { $set: { status: 'approved', applied: false, reviewedBy: moderatorDoc._id, reviewerName: moderatorDoc.name, reviewedAt: new Date() } },
    { new: true }
  );
  if (!edit) {
    if (!(await BookEdit.exists({ _id: editId }))) {
      throw Object.assign(new Error('הצעה לא נמצאה'), { code: 'NOT_FOUND' });
    }
    return { status: 'not-pending' };
  }

  return applyClaimedEdit(edit);
}

/**
 * שחזור לאחר קריסה: הצעות שנתפסו (approved) אך לא הוחלו (applied:false) — להשלים
 * את החלתן, או להחזיר לתור אם נוצר קונפליקט. אידמפוטנטי, מיועד לריצה ב-cron.
 */
export async function reconcileApprovedEdits() {
  await connectDB();
  const stuck = await BookEdit.find({ status: 'approved', applied: false });
  const res = { scanned: stuck.length, applied: 0, conflicts: 0, errors: 0 };
  for (const edit of stuck) {
    try {
      const r = await applyClaimedEdit(edit);
      if (r.status === 'approved' || r.status === 'nochange' || r.status === 'book-missing') res.applied++;
      else if (r.status === 'conflict') res.conflicts++;
    } catch (e) {
      console.error('reconcileApprovedEdits error on', String(edit._id), e.message);
      res.errors++;
    }
  }
  return res;
}

export async function rejectEdit({ editId, moderatorDoc, note }) {
  await connectDB();
  const edit = await BookEdit.findById(editId);
  if (!edit) throw Object.assign(new Error('הצעה לא נמצאה'), { code: 'NOT_FOUND' });
  if (edit.status !== 'pending') return { status: 'not-pending' };

  edit.status = 'rejected';
  edit.reviewedBy = moderatorDoc._id;
  edit.reviewerName = moderatorDoc.name;
  edit.reviewedAt = new Date();
  edit.reviewNote = note || '';
  await edit.save();

  await refreshPendingCount(edit.book);
  return { status: 'rejected' };
}

/**
 * אישור/דחייה באצווה. מקבל רשימת ids או פילטר תבנית (find/replace) לאישור גורף
 * (לדוגמה: "כל ההחלפות של ב→כ").
 * האישור מבוצע ברצף כדי שכל הצעה תיושם על התוכן המעודכן (ולמנוע התנגשויות שווא).
 */
export async function batchModerate({ action, ids, patternFilter, moderatorDoc }) {
  await connectDB();

  let query = { status: 'pending' };
  if (Array.isArray(ids) && ids.length) {
    query._id = { $in: ids };
  } else if (patternFilter?.find != null) {
    query['findReplace.find'] = patternFilter.find;
    if (patternFilter.replace != null) query['findReplace.replace'] = patternFilter.replace;
    query.kind = 'find-replace';
  } else {
    throw Object.assign(new Error('יש לספק רשימת מזהים או פילטר תבנית'), { code: 'BAD_INPUT' });
  }

  const edits = await BookEdit.find(query).select('_id').lean();
  const results = { approved: 0, rejected: 0, conflicts: 0, skipped: 0 };

  for (const { _id } of edits) {
    try {
      if (action === 'approve') {
        const r = await approveEdit({ editId: _id, moderatorDoc });
        if (r.status === 'approved' || r.status === 'nochange') results.approved++;
        else if (r.status === 'conflict') results.conflicts++;
        else results.skipped++;
      } else {
        await rejectEdit({ editId: _id, moderatorDoc });
        results.rejected++;
      }
    } catch (e) {
      console.error('batchModerate error on', String(_id), e.message);
      results.skipped++;
    }
  }

  return results;
}

/**
 * פתרון קונפליקט סנכרון ידנית.
 *  strategy='ours'   → שומר את גרסת האתר; הדחיפה הבאה תדרוס את גיטהאב.
 *  strategy='theirs' → מאמץ את גרסת גיטהאב (מבטל את עריכות האתר לספר זה).
 */
export async function resolveConflict({ bookId, strategy }) {
  await connectDB();
  const book = await LibraryBook.findById(bookId);
  if (!book) throw Object.assign(new Error('הספר לא נמצא'), { code: 'NOT_FOUND' });
  if (book.syncStatus !== 'conflict') return { status: 'not-conflict' };

  const theirsContent = book.conflict?.theirsContent ?? book.baseContent ?? '';
  const theirsSha = book.conflict?.theirsSha ?? book.baseSha ?? null;
  const clear = { theirsContent: null, theirsSha: null, detectedAt: null, conflictCount: 0 };

  if (strategy === 'theirs') {
    book.content = theirsContent;
    book.baseContent = theirsContent;
    book.baseSha = theirsSha;
    book.version = (book.version || 1) + 1;
    book.syncStatus = 'clean';
  } else {
    // 'ours' (ברירת מחדל): שומרים את התוכן הנוכחי, מעדכנים את הבסיס ל-upstream
    book.baseContent = theirsContent;
    book.baseSha = theirsSha;
    book.syncStatus = 'dirty';
  }
  book.conflict = clear;
  await book.save();
  return { status: 'resolved', strategy: strategy === 'theirs' ? 'theirs' : 'ours' };
}

/**
 * חסימת משתמש מעריכה במרחב. אופציונלית — דוחה את כל ההצעות הממתינות שלו.
 * (הצעות שכבר אושרו והוחלו לא מבוטלות כאן — זו פעולה ידנית/מיזוג נפרד.)
 */
export async function setUserBlock({ userId, blocked, reason, moderatorDoc, rejectPending = false }) {
  await connectDB();
  const target = await User.findById(userId);
  if (!target) throw Object.assign(new Error('משתמש לא נמצא'), { code: 'NOT_FOUND' });

  target.dictaEditBlocked = !!blocked;
  target.dictaEditBlockedReason = blocked ? (reason || '') : '';
  target.dictaEditBlockedBy = blocked ? moderatorDoc._id : null;
  target.dictaEditBlockedAt = blocked ? new Date() : null;
  await target.save();

  let rejected = 0;
  if (blocked && rejectPending) {
    const pend = await BookEdit.find({ author: userId, status: 'pending' }).select('_id book').lean();
    const bookIds = [...new Set(pend.map((p) => String(p.book)))];
    const res = await BookEdit.updateMany(
      { author: userId, status: 'pending' },
      { $set: { status: 'rejected', reviewedBy: moderatorDoc._id, reviewerName: moderatorDoc.name, reviewedAt: new Date(), reviewNote: 'נדחה עקב חסימת המשתמש' } }
    );
    rejected = res.modifiedCount || 0;
    for (const bId of bookIds) await refreshPendingCount(bId);
  }

  return { blocked: target.dictaEditBlocked, rejected };
}
