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

/** סטטוס מקטע, עם תאימות לאחור: מסמכים שנוצרו לפני שדה ה-status → 'pending'. */
const changeStatus = (c) => c.status || 'pending';

/** מונה את המקטעים שעדיין ממתינים בהצעה (כולל מקטעים ללא שדה status — ישנים). */
async function countPendingChanges(editId) {
  const doc = await BookEdit.findById(editId).select('changes.status').lean();
  if (!doc) return 0;
  return (doc.changes || []).filter((c) => (c.status || 'pending') === 'pending').length;
}

/**
 * מחיל תת-קבוצה של מקטעים על תוכן הספר, מקטע-מקטע, עם CAS על version + ניסיון חוזר.
 * החלת כל מקטע נפרדת כך שניתן לזהות *אילו* מקטעים נכשלו (קונפליקט) ואילו הוחלו —
 * זהו הלב של האישור החלקי. applyHunks אידמפוטנטי, לכן החלה כפולה (מירוץ/שחזור) בטוחה.
 * @returns {Promise<{okChanges:Array, conflictChanges:Array, bookMissing?:boolean, version?:number}>}
 *   okChanges/conflictChanges הם *אותן רפרנסים* מתוך subset (להשוואת זהות אצל הקורא).
 */
async function applyChangeSubset(edit, subset) {
  if (!subset.length) return { okChanges: [], conflictChanges: [] };

  for (let attempt = 0; attempt < 4; attempt++) {
    const book = await LibraryBook.findById(edit.book).select('content version syncStatus');
    if (!book) {
      // הספר נמחק — אין מה להחיל; מסמנים כמטופלים כדי לא לעבד שוב לנצח
      return { okChanges: [...subset], conflictChanges: [], bookMissing: true };
    }

    let cur = book.content || '';
    const okChanges = [];
    const conflictChanges = [];
    for (const c of subset) {
      const { content, conflicts } = applyHunks(cur, [{ before: c.before, after: c.after }]);
      if (conflicts.length) conflictChanges.push(c);
      else { cur = content; okChanges.push(c); }
    }

    if (cur === (book.content || '')) {
      // שום שינוי טקסטואלי (הכל אידמפוטני או הכל קונפליקט) — אין צורך בכתיבה/בקפיצת גרסה
      return { okChanges, conflictChanges };
    }

    const updated = await LibraryBook.findOneAndUpdate(
      { _id: book._id, version: book.version },
      { $set: { content: cur, syncStatus: book.syncStatus === 'conflict' ? 'conflict' : 'dirty' }, $inc: { version: 1 } },
      { new: true }
    );
    if (updated) return { okChanges, conflictChanges, version: updated.version };
    // version השתנה במקביל — ננסה שוב על התוכן העדכני
  }

  throw Object.assign(new Error('עדכון מקבילי, נסה שוב'), { code: 'RETRY' });
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

  // מחילים רק מקטעים שאינם דחויים ושטרם הוחלו. דילוג על applied מונע יישום-כפול
  // (שמשכפל הוספות / נכשל כקונפליקט-שווא במחיקות) כשמאשרים "הכל" אחרי אישור חלקי.
  const toApply = (edit.changes || []).filter((c) => changeStatus(c) !== 'rejected' && !c.applied);

  // סימון כל המקטעים שאינם דחויים כ-approved+applied בסיום מוצלח.
  const markApplied = (extra = {}) => BookEdit.updateOne(
    { _id: edit._id },
    { $set: { applied: true, 'changes.$[el].status': 'approved', 'changes.$[el].applied': true, ...extra } },
    { arrayFilters: [{ 'el.status': { $ne: 'rejected' } }] }
  );

  if (!toApply.length) {
    // אין מה להחיל (הכל כבר הוחל או נדחה) — סוגרים את ההצעה כמאושרת.
    await markApplied();
    await refreshPendingCount(edit.book);
    return { status: 'nochange' };
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const book = await LibraryBook.findById(edit.book).select('content version syncStatus');
    if (!book) {
      // הספר נמחק — אין מה להחיל; מסמנים applied כדי לא לעבד שוב לנצח
      await markApplied();
      return { status: 'book-missing' };
    }

    const { content, conflicts } = applyHunks(book.content || '', toApply);
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
      await markApplied({ baseVersion: updated.version - 1 });
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
 * אישור/דחייה ברמת המקטע הבודד — "אישור חלקי" של הצעה.
 * מקבל רשימות אינדקסים (לתוך edit.changes) לאישור ולדחייה. מקטעים שלא נכללו
 * נשארים ממתינים, וההצעה נשארת בתור עד שכל מקטעיה הוכרעו.
 *
 * זרימה בטוחת-קריסה:
 *  1. סימון המקטעים הנבחרים ושמירה (לפני ההחלה) — כך reconcile ישלים אחרי קריסה.
 *  2. החלת המקטעים שאושרו (אידמפוטני, מקטע-מקטע) עם CAS על תוכן הספר.
 *  3. סימון applied למוצלחים; מקטע שנכשל ביישום (קונפליקט) מוחזר ל-pending כדי
 *     שיופיע שוב בתור. אם לא נותרו מקטעים ממתינים — ההצעה נסגרת (approved/rejected).
 * @returns {Promise<{status:'partial'|'approved'|'rejected'|'not-pending'|'noop', approved:number, rejected:number, conflicts:number, remainingPending:number}>}
 */
export async function moderateChanges({ editId, approve = [], reject = [], moderatorDoc, note }) {
  await connectDB();

  if (!Array.isArray(approve) || !Array.isArray(reject)) {
    throw Object.assign(new Error('approve ו-reject חייבים להיות מערכים'), { code: 'BAD_INPUT' });
  }
  // אינדקסים חייבים להיות מספרים שלמים אי-שליליים (לא NaN/שבר/שלילי).
  const isIndex = (n) => Number.isInteger(n) && n >= 0;
  if (![...approve, ...reject].every(isIndex)) {
    throw Object.assign(new Error('אינדקס מקטע לא חוקי'), { code: 'BAD_INPUT' });
  }
  const approveSet = new Set(approve);
  const rejectSet = new Set(reject);
  if (!approveSet.size && !rejectSet.size) {
    throw Object.assign(new Error('לא נבחרו מקטעים'), { code: 'BAD_INPUT' });
  }
  for (const i of approveSet) {
    if (rejectSet.has(i)) throw Object.assign(new Error('מקטע סומן גם לאישור וגם לדחייה'), { code: 'BAD_INPUT' });
  }

  const edit = await BookEdit.findById(editId);
  if (!edit) throw Object.assign(new Error('הצעה לא נמצאה'), { code: 'NOT_FOUND' });
  if (edit.status !== 'pending') return { status: 'not-pending' };

  // טווח: כל אינדקס חייב להצביע על מקטע קיים בהצעה.
  const n = edit.changes.length;
  if ([...approveSet, ...rejectSet].some((i) => i >= n)) {
    throw Object.assign(new Error('אינדקס מקטע מחוץ לטווח'), { code: 'BAD_INPUT' });
  }

  // 1) תפיסה אטומית פר-מקטע: כל מקטע נתפס רק אם הוא עדיין ממתין (CAS לפי האינדקס
  //    והסטטוס הנוכחי). כך אם שני מנהלים פועלים על אותו מקטע בו-זמנית — רק הראשון
  //    מכריע, והשני מקבל modifiedCount=0 ופשוט מדלג. אין שמירת-מסמך מלאה (שהייתה
  //    יכולה לדרוס הכרעה של מנהל אחר על מקטע אחר).
  const pendingMatch = { $in: ['pending', null] };
  let rejectedNow = 0;
  let approvedNow = 0;
  if (rejectSet.size > 0) {
    const rejectOps = [...rejectSet].map((i) => ({
      updateOne: {
        filter: { _id: editId, status: 'pending', [`changes.${i}.status`]: pendingMatch },
        update: { $set: { [`changes.${i}.status`]: 'rejected' } },
      },
    }));
    const res = await BookEdit.bulkWrite(rejectOps, { ordered: false });
    rejectedNow = res.modifiedCount || 0;
  }
  if (approveSet.size > 0) {
    const approveOps = [...approveSet].map((i) => ({
      updateOne: {
        filter: { _id: editId, status: 'pending', [`changes.${i}.status`]: pendingMatch },
        update: { $set: { [`changes.${i}.status`]: 'approved', [`changes.${i}.applied`]: false } },
      },
    }));
    const res = await BookEdit.bulkWrite(approveOps, { ordered: false });
    approvedNow = res.modifiedCount || 0;
  }
  if (!rejectedNow && !approvedNow) {
    return { status: 'noop', approved: 0, rejected: 0, conflicts: 0, remainingPending: await countPendingChanges(editId) };
  }

  // 2) החלת כל המקטעים שבמצב approved&!applied (כולל כאלה שנתפסו במקביל) — אידמפוטני.
  const fresh = await BookEdit.findById(editId);
  if (!fresh) throw Object.assign(new Error('הצעה לא נמצאה'), { code: 'NOT_FOUND' });
  const toApply = fresh.changes.filter((c) => c.status === 'approved' && !c.applied);
  const { okChanges, conflictChanges } = await applyChangeSubset(fresh, toApply);

  // 3) עדכון אטומי פר-מקטע: applied למוצלחים; קונפליקט → חזרה ל-pending (אם עדיין
  //    approved&!applied, כדי לא לדרוס הכרעה מקבילה).
  const settleOps = [];
  for (const c of okChanges) {
    const i = fresh.changes.indexOf(c);
    if (i >= 0) {
      settleOps.push({
        updateOne: {
          filter: { _id: editId },
          update: { $set: { [`changes.${i}.applied`]: true } },
        },
      });
    }
  }
  for (const c of conflictChanges) {
    const i = fresh.changes.indexOf(c);
    if (i >= 0) {
      settleOps.push({
        updateOne: {
          filter: { _id: editId, [`changes.${i}.status`]: 'approved', [`changes.${i}.applied`]: false },
          update: { $set: { [`changes.${i}.status`]: 'pending' } },
        },
      });
    }
  }
  if (settleOps.length > 0) await BookEdit.bulkWrite(settleOps, { ordered: false });

  // 4) סגירה אטומית: רק אם לא נותר אף מקטע ממתין. הסטטוס נגזר מהאם יש מקטע מאושר.
  const settled = await BookEdit.findById(editId);
  const remainingPending = settled.changes.filter((c) => changeStatus(c) === 'pending').length;
  let finalStatus = 'partial';
  if (remainingPending === 0) {
    const anyApproved = settled.changes.some((c) => c.status === 'approved');
    finalStatus = anyApproved ? 'approved' : 'rejected';
    const allApplied = settled.changes.every((c) => c.status !== 'approved' || c.applied);
    await BookEdit.updateOne(
      { _id: editId, status: 'pending', 'changes.status': { $nin: ['pending', null] } },
      { $set: { status: finalStatus, applied: allApplied, reviewedBy: moderatorDoc._id, reviewerName: moderatorDoc.name, reviewedAt: new Date(), ...(note ? { reviewNote: note } : {}) } }
    );
  }
  await refreshPendingCount(settled.book);

  return {
    status: finalStatus,
    approved: okChanges.length,
    rejected: rejectedNow,
    conflicts: conflictChanges.length,
    remainingPending,
  };
}

/**
 * שחזור לאחר קריסה (אידמפוטנטי, מיועד לריצה ב-cron). מטפל בשני מצבים:
 *  (א) הצעות שלמות שנתפסו (status=approved, applied=false) — מסלול האישור המלא.
 *  (ב) הצעות פתוחות (pending) עם מקטעים שאושרו אך לא הוחלו — אישור חלקי שנקטע.
 */
export async function reconcileApprovedEdits() {
  await connectDB();
  const res = { scanned: 0, applied: 0, conflicts: 0, errors: 0 };

  const stuck = await BookEdit.find({ status: 'approved', applied: false });
  res.scanned += stuck.length;
  for (const edit of stuck) {
    try {
      const r = await applyClaimedEdit(edit);
      if (r.status === 'approved' || r.status === 'nochange' || r.status === 'book-missing') res.applied++;
      else if (r.status === 'conflict') res.conflicts++;
    } catch (e) {
      console.error('reconcileApprovedEdits(full) error on', String(edit._id), e.message);
      res.errors++;
    }
  }

  const partial = await BookEdit.find({ status: 'pending', changes: { $elemMatch: { status: 'approved', applied: false } } });
  res.scanned += partial.length;
  for (const edit of partial) {
    try {
      const toApply = edit.changes.filter((c) => c.status === 'approved' && !c.applied);
      const { okChanges, conflictChanges } = await applyChangeSubset(edit, toApply);
      const okSet = new Set(okChanges);
      const conflictSet = new Set(conflictChanges);
      edit.changes.forEach((c) => {
        if (okSet.has(c)) c.applied = true;
        else if (conflictSet.has(c)) { c.status = 'pending'; c.applied = false; }
      });
      if (edit.changes.filter((c) => changeStatus(c) === 'pending').length === 0) {
        edit.status = edit.changes.some((c) => c.status === 'approved') ? 'approved' : 'rejected';
        edit.applied = edit.changes.every((c) => c.status !== 'approved' || c.applied);
      }
      await edit.save();
      await refreshPendingCount(edit.book);
      res.applied += okChanges.length;
      res.conflicts += conflictChanges.length;
    } catch (e) {
      console.error('reconcileApprovedEdits(partial) error on', String(edit._id), e.message);
      res.errors++;
    }
  }

  return res;
}

/**
 * דחיית הצעה. דוחה את כל המקטעים שעדיין *ממתינים* בלבד — מקטעים שכבר אושרו והוחלו
 * על הספר נשמרים (אין revert של תוכן שאושר ביודעין). לכן הצעה שעברה אישור חלקי
 * תיסגר כ-'approved' (כי יש בה מקטע מאושר), ולא תסומן בטעות כ-'rejected'.
 * בהצעה שכולה ממתינה — כל המקטעים נדחים והסטטוס 'rejected', בדיוק כמקודם.
 */
export async function rejectEdit({ editId, moderatorDoc, note }) {
  await connectDB();
  const edit = await BookEdit.findById(editId);
  if (!edit) throw Object.assign(new Error('הצעה לא נמצאה'), { code: 'NOT_FOUND' });
  if (edit.status !== 'pending') return { status: 'not-pending' };

  edit.changes.forEach((c) => { if (changeStatus(c) === 'pending') c.status = 'rejected'; });
  edit.status = edit.changes.some((c) => c.status === 'approved') ? 'approved' : 'rejected';
  edit.applied = edit.changes.every((c) => c.status !== 'approved' || c.applied);
  edit.reviewedBy = moderatorDoc._id;
  edit.reviewerName = moderatorDoc.name;
  edit.reviewedAt = new Date();
  edit.reviewNote = note || '';
  await edit.save();

  await refreshPendingCount(edit.book);
  return { status: edit.status };
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
    // עוברים דרך rejectEdit (ולא updateMany ישיר) כדי שהצעה שעברה אישור חלקי תידחה
    // רק במקטעיה הממתינים — מקטעים שכבר אושרו והוחלו על הספר נשמרים, וההצעה לא
    // מסומנת בטעות כ-rejected. rejectEdit כבר מעדכן pendingCount לכל ספר.
    const pend = await BookEdit.find({ author: userId, status: 'pending' }).select('_id').lean();
    for (const { _id } of pend) {
      try {
        const r = await rejectEdit({ editId: _id, moderatorDoc, note: 'נדחה עקב חסימת המשתמש' });
        if (r.status === 'rejected') rejected++;
      } catch (e) {
        console.error('setUserBlock rejectEdit error on', String(_id), e.message);
      }
    }
  }

  return { blocked: target.dictaEditBlocked, rejected };
}
