import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כדי שטסט-האינטגרציה (adminPages.int.test.mjs) ירוץ
// עם node:test מול MongoDB אמיתי, כמו claims.js
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import User from '../../models/User.js';
import { storedRevision } from './importRules.js';
import { adminPageState, adminCounts, leaseOf } from './adminGrid.js';
import { recutRequestsOfBook } from './recutRequests.js';

// רשת-העמודים של ספר בניהול (/library/admin/page-proof): כל העמודים עם המצב,
// מי מחזיק ועד מתי; המתג "פתוח למתנדבים" (לעמוד, לטווח, או "פתח רק אותם וסגור
// את כל השאר"); ושחרור תפיסה בידי מנהל — גם כשהמתנדב עוד מחזיק בעמוד.
// ההרשאה (מנהל OCR) נבדקת בראוטים; כאן — המסד בלבד. כל פונקציה מחזירה
// {ok:true, ...} או {ok:false, status, error} (respond.fromResult).

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error) => ({ ok: false, status, error });
const NO_BOOK = 'הספר לא נמצא';

// כמה מזהי-עמודים בבקשה אחת (ספר גדול — עד כמה אלפי עמודים)
export const MAX_IDS = 5000;

const FIELDS = {
  page: 1,
  seq: 1,
  lineCount: 1,
  required: 1,
  status: 1,
  activeCount: 1,
  approvedCount: 1,
  leasedBy: 1,
  leasedUntil: 1,
  revision: 1,
  volunteer: 1,
};

const bookOf = (gid) => PageProofBook.findOne({ gid: String(gid) }, { gid: 1, title: 1, script: 1, status: 1 }).lean();

// ← {book, pages, counts} או null. לכל עמוד: state (adminGrid.adminPageState),
// volunteer, holder (שם המתנדב — גם כשהתפיסה פגה ועוד רשומה), leasedUntil,
// lease ('active'/'expired'/null), pending (הגשות שממתינות לאישור), ו-recutRequest —
// לעמוד שממתין לזיהוי-מחדש בבקשת מתנדב: {id (של הבקשה — לביטול ב-release_recut), by, at,
// picked (תוכנת-הספר כבר משכה אותה)}, אחרת null.
export async function adminBookPages(gid, now = new Date()) {
  const book = await bookOf(gid);
  if (!book) return null;
  const [pages, requests] = await Promise.all([
    PageProofPage.find({ book: book._id }, FIELDS).sort({ page: 1 }).lean(),
    recutRequestsOfBook(book.gid),
  ]);
  const holders = [...new Set(pages.filter((p) => p.leasedBy).map((p) => String(p.leasedBy)))];
  const users = holders.length ? await User.find({ _id: { $in: holders.map(oid) } }, { name: 1 }).lean() : [];
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]));
  const out = pages.map((p) => {
    const lease = leaseOf(p, now);
    const req = p.status === 'recut' ? requests.get(String(p._id)) : null;
    return {
      id: String(p._id),
      page: p.page,
      seq: p.seq,
      lineCount: p.lineCount || 0,
      required: p.required || 1,
      revision: storedRevision(p),
      state: adminPageState(p, now),
      volunteer: p.volunteer !== false,
      holder: lease ? nameOf.get(String(p.leasedBy)) || 'משתמש שנמחק' : null,
      leasedUntil: lease ? p.leasedUntil : null,
      lease,
      pending: Math.max(0, (p.activeCount || 0) - (p.approvedCount || 0)),
      recutRequest: req && req.revision === storedRevision(p) ? { id: req.id, by: req.by, at: req.at, picked: req.picked } : null,
    };
  });
  return {
    book: { gid: book.gid, title: book.title, script: book.script || null, active: book.status === 'active' },
    pages: out,
    counts: adminCounts(out),
  };
}

const validIds = (ids) => Array.isArray(ids) && ids.length > 0 && ids.length <= MAX_IDS && ids.every((id) => mongoose.Types.ObjectId.isValid(String(id)));
const isPageNo = (n) => Number.isInteger(n) && n >= 1;

// הבחירה בבקשה ← {sel, rest} (מסנני-Mongo: הנבחרים, וכל השאר בספר) או {error}.
// ids — עמודים מסוימים; from/to — טווח מספרי-עמוד; בלי שניהם — כל הספר.
function selection({ ids = null, from = null, to = null }) {
  if (ids !== null && ids !== undefined) {
    if (!validIds(ids)) return { error: 'רשימת עמודים לא תקינה' };
    const list = ids.map(oid);
    return { sel: { _id: { $in: list } }, rest: { _id: { $nin: list } } };
  }
  if (from !== null && from !== undefined) {
    const last = to === null || to === undefined ? from : to;
    if (!isPageNo(from) || !isPageNo(last) || from > last) return { error: 'טווח עמודים לא תקין' };
    return { sel: { page: { $gte: from, $lte: last } }, rest: { $or: [{ page: { $lt: from } }, { page: { $gt: last } }] } };
  }
  return { sel: {}, rest: null };
}

// "פתוח למתנדבים": volunteer (true/false) לנבחרים; others (true/false, רשות) —
// לכל שאר עמודי הספר ("עמודים 1–20 פתוחים, וסגור את כל השאר":
// {volunteer:true, from:1, to:20, others:false}). עמוד שנסגר ממשיך אצל מי
// שכבר מחזיק בו — רק תפיסה חדשה נחסמת (לשחרור — releaseClaims).
// ← {ok, changed, open, closed} (open/closed — מונים לכל הספר אחרי השינוי)
export async function setVolunteer(gid, { volunteer, ids = null, from = null, to = null, others = null } = {}) {
  if (typeof volunteer !== 'boolean') return fail(400, 'חסר: פתוח או סגור למתנדבים');
  if (others !== null && others !== undefined && typeof others !== 'boolean') return fail(400, 'ערך לא תקין לשאר העמודים');
  const pick = selection({ ids, from, to });
  if (pick.error) return fail(400, pick.error);
  const book = await bookOf(gid);
  if (!book) return fail(404, NO_BOOK);

  // רק עמודים שהערך שלהם באמת משתנה (updateMany מעדכן גם updatedAt — בלי המסנן
  // כל עמוד נבחר היה נספר כ"שונה")
  const differs = (v) => (v ? { volunteer: false } : { volunteer: { $ne: false } });
  const res = await PageProofPage.updateMany({ book: book._id, ...pick.sel, ...differs(volunteer) }, { $set: { volunteer } });
  let changed = res.modifiedCount;
  if (typeof others === 'boolean' && pick.rest) {
    const r2 = await PageProofPage.updateMany({ book: book._id, ...pick.rest, ...differs(others) }, { $set: { volunteer: others } });
    changed += r2.modifiedCount;
  }
  const [total, closed] = await Promise.all([
    PageProofPage.countDocuments({ book: book._id }),
    PageProofPage.countDocuments({ book: book._id, volunteer: false }),
  ]);
  return { ok: true, changed, open: total - closed, closed };
}

// שחרור בידי מנהל: ids — העמודים האלה (גם כשהתפיסה בתוקף — המתנדב עוד עובד);
// scope 'expired' — כל התפיסות שפגו ועוד רשומות בספר (ניקוי); scope 'all' — כל
// התפיסות בספר. העמוד חוזר למאגר; טיוטה שלא הוגשה נשארת רק בדפדפן של המתנדב.
// ← {ok, released}
export async function releaseClaims(gid, { ids = null, scope = null } = {}, now = new Date()) {
  const filter = { leasedBy: { $ne: null } };
  if (ids !== null && ids !== undefined) {
    if (!validIds(ids)) return fail(400, 'רשימת עמודים לא תקינה');
    filter._id = { $in: ids.map(oid) };
  } else if (scope === 'expired') {
    filter.$or = [{ leasedUntil: null }, { leasedUntil: { $lte: now } }];
  } else if (scope !== 'all') {
    return fail(400, 'מה לשחרר? עמודים מסוימים, תפיסות שפגו, או כל התפיסות');
  }
  const book = await bookOf(gid);
  if (!book) return fail(404, NO_BOOK);
  const res = await PageProofPage.updateMany({ book: book._id, ...filter }, { $set: { leasedBy: null, leasedUntil: null } });
  return { ok: true, released: res.modifiedCount };
}
