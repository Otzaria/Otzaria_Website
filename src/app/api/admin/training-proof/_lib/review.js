import TrainingProofItem from '@/models/TrainingProofItem';
import TrainingProofVolunteer from '@/models/TrainingProofVolunteer';
import TrainingProofBook from '@/models/TrainingProofBook';
import { checkFramesPage } from '@/components/trainingProof/frames/rules';
import User from '@/models/User';
import { SECTIONS } from '@/lib/trainingProof/vocab';
import { MARK_CHECKS, sameResult } from '@/lib/trainingProof/marks';
import { volunteerStats } from '@/lib/trainingProof/stats';
import { logCorrection, reconcileCorrections } from '@/lib/trainingProof/corrections';
import { oid } from './http';
import { PAGE_SIZE, adminItem, approveSet, rejectUpdate, unapproveUpdate, reviewFilter, routerAgrees, matchPct, framesChanges } from './rules';

// הסקירה והאישור (docs/75 ה-11; docs/76 §8.2): רשימה עם מסננים, אישור/דחייה לפי
// מזהים, אישור גורף על כל התור ("כל ה'נכון' שלא שונו", "הכול ממתנדב", "מה שהמתנדב
// הסכים בו עם הנתב", "כל העמודים שסומנו בספר"), ו"תקן ואשר".
// כל שינוי הוא עדכון מותנה על המצב הנוכחי — פריט שכבר נסקר (או חזר למאגר) לא ייגע.

// userId → שם (המנהל רואה את שמות המתנדבים; לתחנה יוצא רק מזהה אטום)
export async function namesOf(ids) {
  const uniq = [...new Set(ids.filter(Boolean).map(String))];
  if (!uniq.length) return new Map();
  const users = await User.find({ _id: { $in: uniq.map(oid) } }, { name: 1, email: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.name || u.email || 'מתנדב']));
}

// ההגשות הממתינות בנתב שבהן המתנדב הסכים עם ההצעה — מחושב בקוד (מילה-מילה)
async function routerAgreeIds(extra = {}) {
  const docs = await TrainingProofItem.find(
    { section: 'router', status: 'submitted', ...extra },
    { 'payload.pred': 1, 'payload.words': 1, result: 1 }
  ).lean();
  return docs.filter((d) => routerAgrees(d.payload, d.result)).map((d) => d._id);
}

// רשימת הסקירה: {items, total, page, pages}
export async function listReview(q) {
  const filter = reviewFilter(q);
  if (q.vol) filter.vol = oid(q.vol);
  const skip = (q.page - 1) * PAGE_SIZE;
  let docs;
  let total;
  if (q.section === 'router' && q.agree !== null && q.status === 'submitted') {
    const agreeIds = await routerAgreeIds(filter);
    filter._id = q.agree ? { $in: agreeIds } : { $nin: agreeIds };
  }
  total = await TrainingProofItem.countDocuments(filter);
  if (q.section === 'ocr' && q.lowConf) {
    // "ביטחון נמוך קודם" (docs/76 §9): שורה בלי ביטחון — בסוף
    docs = await TrainingProofItem.aggregate([
      { $match: filter },
      { $addFields: { _c: { $ifNull: ['$payload.conf', 101] } } },
      { $sort: { _c: 1, _id: 1 } },
      { $skip: skip },
      { $limit: PAGE_SIZE },
    ]);
  } else {
    const sort = q.status === 'approved' ? { reviewedAt: -1, _id: 1 } : { submittedAt: 1, _id: 1 };
    docs = await TrainingProofItem.find(filter).sort(sort).skip(skip).limit(PAGE_SIZE).lean();
  }
  const names = await namesOf(docs.map((d) => d.vol));
  return { items: docs.map((d) => adminItem(d, names)), total, page: q.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

// המונים של התור בחלק — לכפתורי האישור המהיר (בכל התור, לא רק במסך)
export async function queueStats(section) {
  const base = { section, status: 'submitted' };
  const [submitted, approved, byVol] = await Promise.all([
    TrainingProofItem.countDocuments(base),
    TrainingProofItem.countDocuments({ section, status: 'approved' }),
    TrainingProofItem.aggregate([{ $match: base }, { $group: { _id: '$vol', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
  ]);
  const vids = byVol.map((g) => g._id).filter(Boolean);
  const names = await namesOf(vids);
  const stats = await Promise.all(vids.map((v) => volunteerStats(v).catch(() => null)));
  const vols = vids.map((v, i) => ({
    id: String(v),
    name: names.get(String(v)) || 'מתנדב',
    pending: byVol.find((g) => String(g._id) === String(v))?.n || 0,
    match: matchPct(stats[i]?.[section]?.match),
    judged: (stats[i]?.[section]?.approved || 0) + (stats[i]?.[section]?.rejected || 0),
  }));
  const out = { submitted, approved, vols };
  if (section === 'ocr') out.okUnchanged = await TrainingProofItem.countDocuments({ ...base, 'result.action': 'ok' });
  if (section === 'router') out.agree = (await routerAgreeIds()).length;
  return out;
}

// מוני-הראש: לכל חלק — פנוי · אצל מתנדב · ממתין לאישור · אושר ועוד לא הורד; ובקשות-גישה
export async function summaryCounts() {
  const rows = await TrainingProofItem.aggregate([{ $group: { _id: { s: '$section', st: '$status' }, n: { $sum: 1 } } }]);
  const out = Object.fromEntries(SECTIONS.map((s) => [s, { available: 0, held: 0, submitted: 0, approved: 0 }]));
  for (const r of rows) if (out[r._id.s] && r._id.st in out[r._id.s]) out[r._id.s][r._id.st] = r.n;
  const requests = await TrainingProofVolunteer.countDocuments({ status: 'pending' });
  return { sections: out, requests };
}

// אישור לפי מזהים (רק מה שממתין). מחזיר כמה אושרו
export async function approveIds(section, ids, by, now = new Date()) {
  const res = await TrainingProofItem.updateMany(
    { _id: { $in: ids.map(oid) }, section, status: 'submitted', streamChange: null },
    { $set: approveSet(oid(by), now) }
  );
  return res.modifiedCount;
}

// דחייה לפי מזהים: כל פריט חוזר למאגר, והמתנדב שהגיש נרשם ב-notFor/rejectedFor
export async function rejectIds(section, ids) {
  const docs = await TrainingProofItem.find({ _id: { $in: ids.map(oid) }, section, status: 'submitted' }, { vol: 1 }).lean();
  if (!docs.length) return 0;
  const res = await TrainingProofItem.bulkWrite(
    docs.map((d) => ({ updateOne: { filter: { _id: d._id, status: 'submitted', vol: d.vol }, update: rejectUpdate(d.vol) } }))
  );
  return res.modifiedCount;
}

// "החזר לממתינות": אישור שבוטל (לפני ההורדה). תיקון של המנהל מתבטל
export async function unapproveIds(section, ids) {
  const docs = await TrainingProofItem.find(
    { _id: { $in: ids.map(oid) }, section, status: 'approved' },
    { adminFixed: 1, volResult: 1 }
  ).lean();
  if (!docs.length) return 0;
  // findOneAndUpdate מחזיר בדיוק אילו עדכונים מותנים הצליחו. כך מרוץ עם מנהל אחר
  // אינו מוחק יומן של פריט שלא הוחזר בפועל.
  const changed = [];
  for (const d of docs) {
    const updated = await TrainingProofItem.findOneAndUpdate(
      { _id: d._id, section, status: 'approved' },
      unapproveUpdate(d),
      { returnDocument: 'after', lean: true }
    );
    if (updated) changed.push(updated._id);
  }
  // reconciliation בודק שוב את המצב הנוכחי: אם הפריט כבר תוקן ואושר מחדש במרוץ,
  // הרשומה החדשה נבנית מחדש במקום להימחק.
  await reconcileCorrections(changed);
  return changed.length;
}

// אישור גורף על כל התור בחלק. kind:
//   ok-unchanged (זיהוי) — כל מה שהמתנדב סימן "נכון" (בלי שינוי אות)
//   volunteer — כל הממתינות של מתנדב אחד (opts.vol)
//   router-agree (נתב) — כל מה שהמתנדב הסכים בו עם הנתב
//   book (גלאי) — כל העמודים שסומנו בספר (opts.book)
// מחזיר {count} או {error}
export async function bulkApprove(section, kind, { vol = null, book = null, dry = false } = {}, by, now = new Date()) {
  const base = { section, status: 'submitted', streamChange: null };
  let filter;
  if (kind === 'ok-unchanged' && section === 'ocr') filter = { ...base, 'result.action': 'ok' };
  else if (kind === 'volunteer' && vol) filter = { ...base, vol: oid(vol) };
  else if (kind === 'router-agree' && section === 'router') filter = { ...base, _id: { $in: await routerAgreeIds() } };
  else if (kind === 'book' && section === 'frames' && book) filter = { ...base, book };
  else return { error: 'סוג אישור לא מוכר לחלק הזה' };
  if (dry) return { count: await TrainingProofItem.countDocuments(filter) };
  const res = await TrainingProofItem.updateMany(filter, { $set: approveSet(oid(by), now) });
  return { count: res.modifiedCount };
}

// "תקן ואשר" בגלאי: אותה בדיקה של עמוד שהמתנדב מסמן (checkFramesPage), מול הזרמים של הספר.
// המנהל מאשר עמוד מסומן או מדולג — לא טיוטה
async function framesFixCheck(item) {
  const book = await TrainingProofBook.findOne({ book: item.payload?.book ?? item.book }, { streams: 1 }).lean();
  const streams = book?.streams || [];
  return (payload, mark) =>
    checkFramesPage(payload, { ...mark, status: mark?.status === 'skip' ? 'skip' : 'marked' }, { streams });
}

// "תקן ואשר" (ה-11): המנהל מתקן לפני האישור. mark — באותה צורה שהמתנדב שולח
// ({action,text} / {label,bad,words}). תיקון זהה למה שהמתנדב סימן = אישור רגיל.
// check — בדיקה לחלק (frames: מהגלאי, כשתהיה); ברירת-מחדל MARK_CHECKS.
// מחזיר {ok, item, fixed} או {ok:false,status,error}
export async function fixAndApprove(id, mark, by, now = new Date(), check = null) {
  const item = await TrainingProofItem.findOne({ _id: oid(id), status: 'submitted', streamChange: null }).lean();
  if (!item) return { ok: false, status: 409, error: 'הפריט כבר לא ממתין לאישור' };
  const checker = check || MARK_CHECKS[item.section] || (item.section === 'frames' ? await framesFixCheck(item) : null);
  if (!checker) return { ok: false, status: 400, error: 'תיקון בחלק הזה נעשה בעורך המסגרות' };
  const { result, error } = checker(item.payload, mark);
  if (error) return { ok: false, status: 400, error };
  if (result.action === 'skip') return { ok: false, status: 400, error: '"דלג" אינו תיקון — אפשר לדחות את השורה' };
  const same = sameResult(item.section, item.result, result);
  const set = same
    ? approveSet(oid(by), now)
    : { ...approveSet(oid(by), now), result, adminFixed: true, volResult: item.result, correctionLoggedAt: null };
  const doc = await TrainingProofItem.findOneAndUpdate(
    { _id: item._id, status: 'submitted', submittedAt: item.submittedAt, streamChange: null },
    { $set: set },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return { ok: false, status: 409, error: 'הפריט השתנה בינתיים — רעננו את הרשימה' };
  // יומן התיקונים של המנהל, לפי מתנדב (שורד את מחיקת הפריט בהורדה)
  if (!same) {
    const changes = item.section === 'frames' ? framesChanges(item.result?.frames, result.frames) : null;
    try {
      await logCorrection(doc, { by, at: now, changes });
    } catch (e) {
      // האישור האטומי הוא מקור-האמת. listCorrections והייצוא ישלימו את היומן;
      // אין להחזיר 500 מטעה לאחר שהפעולה כבר הצליחה ואין לנסות לאשר שוב.
      console.error('training-proof correction log deferred', String(doc._id), e?.message || e);
    }
  }
  const names = await namesOf([doc.vol]);
  return { ok: true, item: adminItem(doc, names), fixed: !same };
}
