import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';
import BookEdit from '@/models/BookEdit';
import { canEditLibraryDirectly } from '@/lib/roles';
import { diffToHunks } from '@/lib/dicta/text-diff';
import { EDIT_TYPE_IDS } from '@/lib/dicta/edit-constants';

/** מנרמל סוג תיקון לערך חוקי או null (סיווג אופציונלי) */
function normalizeEditType(t) {
  return t && EDIT_TYPE_IDS.includes(t) ? t : null;
}

/**
 * מריץ regex.replace בתוך worker thread עם timeout קשיח (ברירת מחדל 2 שניות).
 * Node חד-תהליכי — regex עם catastrophic backtracking יחסום את כל האתר. הרצה
 * ב-worker מאפשרת terminate() שעוצר גם ריצה סינכרונית תקועה. מגן מפני ReDoS.
 */
async function safeRegexReplace(content, source, flags, replacement, timeoutMs = 2000) {
  const { Worker } = await import('node:worker_threads');
  const code = `
    const { parentPort, workerData } = require('worker_threads');
    try {
      const re = new RegExp(workerData.source, workerData.flags);
      parentPort.postMessage({ ok: true, result: workerData.content.replace(re, workerData.replacement) });
    } catch (e) {
      parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
    }
  `;
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(code, { eval: true, workerData: { content, source, flags, replacement } });
    } catch (e) {
      reject(e);
      return;
    }
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Object.assign(new Error('פעולת החיפוש-והחלפה ארכה מדי — ייתכן שהתבנית כבדה מדי'), { code: 'BAD_INPUT' }));
    }, timeoutMs);
    worker.once('message', (m) => {
      clearTimeout(timer);
      worker.terminate();
      if (m.ok) resolve(m.result);
      else reject(Object.assign(new Error('תבנית החיפוש אינה תקינה: ' + m.error), { code: 'BAD_INPUT' }));
    });
    worker.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** מעדכן את מונה ההצעות הממתינות על הספר */
async function refreshPendingCount(bookId) {
  const count = await BookEdit.countDocuments({ book: bookId, status: 'pending' });
  await LibraryBook.updateOne({ _id: bookId }, { $set: { pendingCount: count } });
  return count;
}

/**
 * מחיל שינוי ישירות על הספר (עורך-ישיר: מפקח/מנהל) ורושם BookEdit מאושר.
 * נעילה אופטימית: אם baseVersion שונה מגרסת הספר → STALE (מישהו שמר בינתיים).
 * העדכון מבוצע עם CAS על version כדי למנוע דריסה במקביל.
 */
async function applyDirect({ book, userDoc, newContent, kind, editType, note, findReplace, baseVersion }) {
  if (baseVersion != null && book.version !== baseVersion) {
    throw Object.assign(new Error('הספר עודכן בינתיים'), { code: 'STALE', currentVersion: book.version });
  }

  const hunks = diffToHunks(book.content || '', newContent);

  const updated = await LibraryBook.findOneAndUpdate(
    { _id: book._id, version: book.version },
    {
      $set: { content: newContent, syncStatus: book.syncStatus === 'conflict' ? 'conflict' : 'dirty' },
      $inc: { version: 1 },
    },
    { new: true }
  );
  if (!updated) {
    throw Object.assign(new Error('הספר עודכן בינתיים'), { code: 'STALE' });
  }

  const edit = await BookEdit.create({
    book: book._id,
    bookPath: book.path,
    author: userDoc._id,
    authorName: userDoc.name,
    status: 'approved',
    appliedDirectly: true,
    applied: true,
    kind,
    editType: normalizeEditType(editType),
    note: note || '',
    findReplace: findReplace || undefined,
    changes: hunks,
    baseVersion: updated.version - 1,
    reviewedBy: userDoc._id,
    reviewerName: userDoc.name,
    reviewedAt: new Date(),
  });

  return { status: 'applied', editId: edit._id, changeCount: hunks.length, version: updated.version };
}

/**
 * שמירת הצעה ממתינה (משתמש רגיל). למהדורות ידניות — upsert של ההצעה הפתוחה
 * היחידה של המשתמש לספר זה (כדי לא לצבור כפילויות מטיוטה מתפתחת).
 */
async function submitPending({ book, userDoc, newContent, kind, editType, note, findReplace }) {
  const hunks = diffToHunks(book.content || '', newContent);

  let edit;
  if (kind === 'manual') {
    edit = await BookEdit.findOne({ book: book._id, author: userDoc._id, status: 'pending', kind: 'manual' });
  }

  if (edit) {
    edit.changes = hunks;
    edit.editType = normalizeEditType(editType);
    edit.note = note || '';
    edit.baseVersion = book.version;
    await edit.save();
  } else {
    edit = await BookEdit.create({
      book: book._id,
      bookPath: book.path,
      author: userDoc._id,
      authorName: userDoc.name,
      status: 'pending',
      kind,
      editType: normalizeEditType(editType),
      note: note || '',
      findReplace: findReplace || undefined,
      changes: hunks,
      baseVersion: book.version,
    });
  }

  await refreshPendingCount(book._id);
  return { status: 'pending', editId: edit._id, changeCount: hunks.length };
}

/**
 * הגשת עריכה ידנית (תוכן מלא מהעורך).
 * מפקח/מנהל → מוחל מיד; משתמש רגיל → הצעה ממתינה.
 */
export async function submitManualEdit({ bookId, userDoc, newContent, editType, note, baseVersion }) {
  await connectDB();
  if (userDoc.dictaEditBlocked) {
    const err = new Error('המשתמש חסום מעריכה במרחב זה');
    err.code = 'BLOCKED';
    throw err;
  }

  const book = await LibraryBook.findById(bookId);
  if (!book) {
    const err = new Error('הספר לא נמצא');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // נעילה אופטימית לשני המסלולים (ישיר וגם הצעה ממתינה): אם הספר השתנה מאז
  // שהמשתמש פתח אותו, ה-diff מול התוכן הנוכחי עלול "להחזיר לאחור" שינויים של
  // אחרים. מחזירים STALE כדי שהמשתמש ירענן וישלב מחדש.
  if (baseVersion != null && book.version !== baseVersion) {
    throw Object.assign(new Error('הספר עודכן בינתיים'), { code: 'STALE', currentVersion: book.version });
  }

  const normalized = String(newContent == null ? '' : newContent).replace(/\r\n/g, '\n');
  if (diffToHunks(book.content || '', normalized).length === 0) {
    return { status: 'nochange' };
  }

  const opts = { book, userDoc, newContent: normalized, kind: 'manual', editType, note, baseVersion };
  return canEditLibraryDirectly(userDoc) ? applyDirect(opts) : submitPending(opts);
}

const VALID_FLAGS = /^[gimsuy]*$/;

/** בונה RegExp בטוח מתבנית חיפוש-והחלפה */
function buildRegex({ find, isRegex, flags, caseSensitive }) {
  let pattern = isRegex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let f = '';
  if (isRegex && flags) {
    if (!VALID_FLAGS.test(flags)) throw Object.assign(new Error('דגלי regex לא חוקיים'), { code: 'BAD_INPUT' });
    f = flags;
  }
  if (!f.includes('g')) f += 'g';
  if (!caseSensitive && !f.includes('i')) f += 'i';
  // eslint-disable-next-line security/detect-non-literal-regexp
  return new RegExp(pattern, f);
}

/**
 * הגשת חיפוש-והחלפה (כולל regex) כתיקון. מבצע את ההחלפה על התוכן הנוכחי בצד שרת,
 * ושומר את התבנית כדי לאפשר אישור באצווה לפי תבנית.
 */
export async function submitFindReplaceEdit({ bookId, userDoc, find, replace, isRegex, flags, caseSensitive, editType, note }) {
  await connectDB();
  if (userDoc.dictaEditBlocked) {
    throw Object.assign(new Error('המשתמש חסום מעריכה במרחב זה'), { code: 'BLOCKED' });
  }
  if (!find) {
    throw Object.assign(new Error('חסר טקסט לחיפוש'), { code: 'BAD_INPUT' });
  }
  if (find.length > 2000) {
    throw Object.assign(new Error('תבנית החיפוש ארוכה מדי'), { code: 'BAD_INPUT' });
  }
  // regex פתוח מאפשר ReDoS על ספר שלם — מותר למפקחים/מנהלים בלבד.
  // משתמש רגיל מוגבל לחיפוש מילולי (escaped), שאינו חשוף ל-backtracking.
  if (isRegex && !canEditLibraryDirectly(userDoc)) {
    throw Object.assign(new Error('שימוש בביטוי רגולרי (regex) מותר למפקחים בלבד'), { code: 'BAD_INPUT' });
  }

  const book = await LibraryBook.findById(bookId);
  if (!book) throw Object.assign(new Error('הספר לא נמצא'), { code: 'NOT_FOUND' });

  let regex;
  try {
    regex = buildRegex({ find, isRegex, flags, caseSensitive });
  } catch (e) {
    throw Object.assign(new Error('תבנית החיפוש אינה תקינה: ' + e.message), { code: 'BAD_INPUT' });
  }

  const current = (book.content || '').replace(/\r\n/g, '\n');
  // regex רץ ב-worker עם timeout (הגנת ReDoS); חיפוש מילולי בטוח להרצה inline
  const replaced = isRegex
    ? await safeRegexReplace(current, regex.source, regex.flags, replace ?? '')
    : current.replace(regex, replace ?? '');
  if (replaced === current) {
    return { status: 'nochange' };
  }

  const findReplace = { find, replace: replace ?? '', isRegex: !!isRegex, flags: flags || '', caseSensitive: !!caseSensitive };
  const opts = { book, userDoc, newContent: replaced, kind: 'find-replace', editType, note, findReplace };
  return canEditLibraryDirectly(userDoc) ? applyDirect(opts) : submitPending(opts);
}
