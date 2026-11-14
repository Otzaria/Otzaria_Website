import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
// נתיבים יחסיים (לא '@/') — כדי שבדיקת-האינטגרציה (round.int.test.mjs) תרוץ
// עם node:test מול MongoDB אמיתי
import TrainingProofItem from '../../models/TrainingProofItem.js';
import TrainingProofPackage from '../../models/TrainingProofPackage.js';
import { ROUND_SIZE, HOLD_MS } from './vocab.js';
import { MARK_CHECKS } from './marks.js';

// הסבב של 30 בזיהוי-הטקסט ובנתב (docs/75 ה-4, ה-5; docs/76 §8.2):
//
// * takeRound — 30 פריטים אקראיים מכל הספרים והמסלולים ($sample), כל אחד נתפס
//   אטומית (עדכון מותנה על "פנוי"), כמו linePool.js — שתי בקשות מקבילות לא יקבלו
//   אותו פריט. סבב חדש רק כשאין למתנדב פריטים פתוחים בחלק; אחרת חוזר הסבב הקיים.
// * heartbeat — "דופק": הדף שולח כל 60 שניות; heldUntil = עכשיו + 3 דקות לכל מה
//   שעדיין פתוח אצל המתנדב. אין מועד שמוצג למתנדב.
// * releaseRound — יציאה מהדף: מה שלא סומן חוזר ל-available. מה שסומן נשאר.
// * דופק שפסק — פריט held שזמנו עבר נחשב פנוי לכל מתנדב אחר (ונשטף ל-available
//   בתחילת כל סבב חדש — sweepExpired).
// * markItem — כל סימון נשמר מיד, בבקשה משלו. "דלג" מחזיר את הפריט למאגר, והמתנדב
//   לא יקבל אותו שוב (notFor). אפשר לשנות סימון כל עוד המנהל לא סקר אותו.
//
// ההרשאה נבדקת בנתיבים (requireTrainingProofSession); כאן — המסד בלבד.

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error) => ({ ok: false, status, error });

const RELEASE = { status: 'available', heldBy: null, heldUntil: null, heldAt: null, round: null };

// פנוי לתפיסה: available, או held שהדופק שלו פסק
const freeFilter = (now) => ({ $or: [{ status: 'available' }, { status: 'held', heldUntil: { $lt: now } }] });

// חבילות מושהות בחלק (מעטות) — כדי לא לחלק מהן
async function closedParts(section) {
  const closed = await TrainingProofPackage.find({ section, open: false }, { packageId: 1, part: 1 }).lean();
  return closed.map((p) => ({ packageId: p.packageId, part: p.part }));
}

// held שזמנו עבר ← available (לכל המתנדבים). מחזיר כמה שוחררו
export async function sweepExpired(section, now = new Date()) {
  const res = await TrainingProofItem.updateMany({ section, status: 'held', heldUntil: { $lt: now } }, { $set: RELEASE });
  return res.modifiedCount;
}

// הסבב הנוכחי של המתנדב: הפריטים של הסבב האחרון שעדיין אצלו (held) או שסימן ועוד
// לא נסקרו (submitted). done = אין בו עוד פריט פתוח
export async function currentRound(userId, section) {
  const uid = oid(userId);
  const last = await TrainingProofItem.findOne(
    { heldBy: uid, section, round: { $ne: null }, status: { $in: ['held', 'submitted'] } },
    { round: 1 }
  )
    .sort({ heldAt: -1 })
    .lean();
  if (!last) return { round: null, items: [], open: 0, done: true };
  const items = await TrainingProofItem.find({
    round: last.round,
    heldBy: uid,
    section,
    status: { $in: ['held', 'submitted'] },
  })
    .sort({ heldAt: 1, _id: 1 })
    .lean();
  const open = items.filter((d) => d.status === 'held').length;
  return { round: last.round, items, open, done: open === 0 };
}

// סבב חדש. אם למתנדב יש פריטים פתוחים בחלק — מחזיר את הסבב הקיים (resumed) ולא תופס
// עוד: "קח 30 נוספות" רק אחרי שסיים (ה-4).
// בקשה שנייה של אותו מתנדב לאותו חלק, בזמן שהראשונה עוד תופסת, מקבלת את אותה תשובה
// בדיוק (באותו תהליך). consolidate נשאר רשת-ביטחון לבקשות שמגיעות לתהליכים שונים.
const taking = new Map();
export function takeRound(userId, section, opts = {}) {
  const key = `${userId}:${section}`;
  if (taking.has(key)) return taking.get(key);
  const p = takeRoundOnce(userId, section, opts).finally(() => taking.delete(key));
  taking.set(key, p);
  return p;
}

async function takeRoundOnce(userId, section, { size = ROUND_SIZE, now = new Date() } = {}) {
  if (!MARK_CHECKS[section]) return fail(400, 'חלק לא מוכר');
  const uid = oid(userId);
  const cur = await currentRound(userId, section);
  if (cur.open > 0) {
    await heartbeat(userId, section, now);
    return { ok: true, resumed: true, ...(await currentRound(userId, section)) };
  }
  await sweepExpired(section, now);
  const closed = await closedParts(section);
  const round = randomBytes(6).toString('hex');
  const claimed = [];
  const tried = new Set();
  // מספר סבבי-דגימה חסום — הפסדים במרוץ מפוצים בדגימת-יתר בסבב הבא
  for (let pass = 0; pass < 4 && claimed.length < size; pass++) {
    const need = size - claimed.length;
    const match = {
      section,
      ...freeFilter(now),
      notFor: { $ne: uid },
      _id: { $nin: [...tried].map(oid) },
    };
    if (closed.length) match.$nor = closed;
    const cands = await TrainingProofItem.aggregate([{ $match: match }, { $sample: { size: need * 2 } }, { $project: { _id: 1 } }]);
    if (!cands.length) break;
    for (const c of cands) {
      if (claimed.length >= size) break;
      const k = String(c._id);
      if (tried.has(k)) continue;
      tried.add(k);
      // התפיסה — עדכון מותנה יחיד; רק בקשה אחת זוכה בפריט.
      // heldAt עולה במילישנייה לכל פריט — סדר-ההצגה בסבב נשמר גם אחרי רענון
      const doc = await TrainingProofItem.findOneAndUpdate(
        { _id: c._id, section, notFor: { $ne: uid }, ...freeFilter(now) },
        {
          $set: {
            status: 'held',
            heldBy: uid,
            heldUntil: new Date(now.getTime() + HOLD_MS),
            heldAt: new Date(now.getTime() + claimed.length),
            round,
          },
        },
        { returnDocument: 'after', lean: true }
      );
      if (doc) claimed.push(doc);
    }
  }
  if (!claimed.length) return { ok: true, resumed: false, round: null, items: [], open: 0, done: true };
  await consolidate(uid, section, size);
  return { ok: true, resumed: false, ...(await currentRound(userId, section)) };
}

// שתי בקשות "סבב חדש" במקביל מאותו מתנדב (לחיצה כפולה, שתי לשוניות) — כל אחת תופסת
// סבב משלה. כאן הן מתאחדות: כל הפתוחים של המתנדב בחלק עוברים לסבב של הפריט שנתפס
// ראשון, נשארים רק `size` הראשונים, והשאר חוזרים למאגר. אותה תוצאה בכל אחת מהבקשות
// (מיון קבוע לפי heldAt ו-_id), ולכן אין משנה מי מסיימת אחרונה.
async function consolidate(uid, section, size) {
  const open = await TrainingProofItem.find({ heldBy: uid, section, status: 'held' }, { round: 1, heldAt: 1 })
    .sort({ heldAt: 1, _id: 1 })
    .lean();
  if (new Set(open.map((d) => d.round)).size <= 1 && open.length <= size) return;
  const round = open[0].round;
  const keep = open.slice(0, size).map((d) => d._id);
  const extra = open.slice(size).map((d) => d._id);
  await TrainingProofItem.updateMany({ _id: { $in: keep }, heldBy: uid, status: 'held' }, { $set: { round } });
  if (extra.length) await TrainingProofItem.updateMany({ _id: { $in: extra }, heldBy: uid, status: 'held' }, { $set: RELEASE });
}

// הדופק: מאריך את כל מה שפתוח אצל המתנדב בחלק. מחזיר כמה פריטים פתוחים.
// גם פריט שזמנו עבר אבל איש לא לקח אותו עדיין — חוזר להיות שלו
export async function heartbeat(userId, section, now = new Date()) {
  const res = await TrainingProofItem.updateMany(
    { heldBy: oid(userId), section, status: 'held' },
    { $set: { heldUntil: new Date(now.getTime() + HOLD_MS) } }
  );
  return res.matchedCount;
}

// יציאה מהדף: מה שלא סומן חוזר למאגר. מחזיר כמה שוחררו
export async function releaseRound(userId, section) {
  const res = await TrainingProofItem.updateMany({ heldBy: oid(userId), section, status: 'held' }, { $set: RELEASE });
  return res.modifiedCount;
}

// סימון אחד. body — מה שהדף שלח ({action,text} / {label,bad,words}). check — בדיקה
// לחלק (ברירת-מחדל: marks.js; הגלאי מעביר את שלו). מחזיר {ok, item} או {ok:false,status,error}
export async function markItem(userId, itemId, body, { now = new Date(), check = null } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(itemId))) return fail(400, 'מזהה לא תקין');
  const uid = oid(userId);
  const mine = {
    _id: oid(itemId),
    heldBy: uid,
    $or: [{ status: 'held' }, { status: 'submitted', reviewedAt: null }],
  };
  const item = await TrainingProofItem.findOne(mine, { section: 1, payload: 1, status: 1 }).lean();
  if (!item) return fail(409, 'השורה כבר לא אצלך — אולי עבר זמן רב בלי חיבור. קחו סבב חדש');
  const checker = check || MARK_CHECKS[item.section];
  if (!checker) return fail(400, 'חלק לא מוכר');
  const { result, error } = checker(item.payload, body);
  if (error) return fail(400, error);

  if (result.action === 'skip') {
    const doc = await TrainingProofItem.findOneAndUpdate(
      mine,
      { $set: { ...RELEASE, result: null, vol: null, submittedAt: null }, $addToSet: { notFor: uid } },
      { returnDocument: 'after', lean: true }
    );
    return doc ? { ok: true, item: doc, skipped: true } : fail(409, 'השורה כבר לא אצלך');
  }
  const doc = await TrainingProofItem.findOneAndUpdate(
    mine,
    { $set: { status: 'submitted', result, vol: uid, submittedAt: now, heldUntil: null } },
    { returnDocument: 'after', lean: true }
  );
  return doc ? { ok: true, item: doc } : fail(409, 'השורה כבר לא אצלך');
}
