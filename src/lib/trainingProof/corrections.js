import mongoose from 'mongoose';
import TrainingProofCorrection from '../../models/TrainingProofCorrection.js';
import TrainingProofItem from '../../models/TrainingProofItem.js';

// "המתנדבים שהמנהל תיקן" (בקשת בעל הפרויקט, 2026-10-28):
//   * המונה — לכל מתנדב ולכל חלק: אושרו פחות "אושרו בלי שינוי" (volunteerStats ← corrected).
//     שני המונים כבר נשמרים ב-stats.archived לפני המחיקה בהורדה, ולכן הוא שורד את ההורדה.
//   * היומן — TrainingProofCorrection: רשומה לכל "תקן ואשר" שבאמת שינה משהו, עם הגרסה של
//     המתנדב והגרסה של המנהל בצורה מקוצרת (בלי תמונות). אוסף משלו — שורד את מחיקת הפריט.
//     נשמרות רק CORRECTIONS_KEEP האחרונות לכל מתנדב. קובץ-ההחזרה לתחנה לא משתנה.

export const CORRECTIONS_KEEP = 200;

const oid = (v) => new mongoose.Types.ObjectId(String(v));

const sameBox = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

// נגזר כולו מה-outbox כדי שגם ניסיון השלמה מאוחר ישחזר את אותו ערך.
function frameChanges(before, after) {
  const old = new Map((Array.isArray(before) ? before : []).map((f) => [f.fid, f]));
  const next = Array.isArray(after) ? after : [];
  const seen = new Set();
  let n = 0;
  for (const f of next) {
    seen.add(f.fid);
    const prev = old.get(f.fid);
    if (!prev) n++;
    else {
      const keys = ['kind', 'role', 'obj', 'stream', 'ord', 'cont'];
      if (keys.some((k) => (prev[k] ?? null) !== (f[k] ?? null)) || !sameBox(prev.box, f.box)) n++;
    }
  }
  for (const fid of old.keys()) if (!seen.has(fid)) n++;
  return n;
}

// סימון ← הצורה המקוצרת שביומן (טהור). זיהוי: מה הפעולה והטקסט שנקבע; נתב: כתב-השורה וכתב
// כל מילה; גלאי: מצב העמוד ומספר המסגרות (ההבדל עצמו — changes)
export function markSummary(section, payload, r) {
  if (!r) return null;
  if (section === 'ocr') {
    const text = r.action === 'fixed' ? r.text : r.action === 'ok' ? payload?.text ?? '' : '';
    return { action: r.action, text: String(text || '').slice(0, 4000) };
  }
  if (section === 'router') {
    if (r.bad) return { bad: true };
    return { label: r.label, words: Array.isArray(r.words) ? r.words.map((w) => w.label) : null };
  }
  return { status: r.status, frames: Array.isArray(r.frames) ? r.frames.length : 0 };
}

// אחרי "תקן ואשר" שבו המנהל שינה את הסימון. doc — הפריט אחרי העדכון (result = של המנהל,
// volResult = של המתנדב). changes — רק בגלאי (כמה מסגרות שונו)
export async function logCorrection(doc, { by = null, at = new Date(), changes = null, trim = true } = {}) {
  if (!doc?.vol || !doc.adminFixed) return null;
  const p = doc.payload || {};
  const values = {
    vol: doc.vol,
    section: doc.section,
    item: doc._id,
    uid: doc.uid || '',
    alias: p.alias || '',
    page: Number.isInteger(p.page) ? p.page : null,
    track: doc.section === 'ocr' ? p.track || null : doc.section === 'router' ? p.pred || null : null,
    before: markSummary(doc.section, p, doc.volResult),
    after: markSummary(doc.section, p, doc.result),
    changes: doc.section === 'frames' ? (changes ?? frameChanges(doc.volResult?.frames, doc.result?.frames)) : changes,
    by: by ? oid(by) : null,
    at,
  };
  const entry = await TrainingProofCorrection.findOneAndUpdate(
    { item: doc._id },
    { $set: values },
    { upsert: true, returnDocument: 'after', lean: true }
  );
  await TrainingProofItem.updateOne(
    { _id: doc._id, status: 'approved', adminFixed: true },
    { $set: { correctionLoggedAt: at } }
  );
  if (trim) await trimCorrections(doc.vol);
  return entry;
}

// TrainingProofItem הוא ה-outbox ומקור-האמת: כל הנתונים הדרושים ליומן נשמרים עליו
// באותו עדכון אטומי שמאשר את התיקון. לכן אפשר להשלים בבטחה כתיבה שנכשלה או נקטעה.
export async function syncCorrections(docs) {
  const valid = (docs || []).filter((d) => d?.status === 'approved' && d.adminFixed && d.vol);
  if (!valid.length) return 0;
  for (const doc of valid) await logCorrection(doc, { by: doc.reviewedBy, at: doc.reviewedAt, trim: false });
  for (const vol of new Set(valid.map((d) => String(d.vol)))) await trimCorrections(vol);
  return valid.length;
}

// רק CORRECTIONS_KEEP האחרונות לכל מתנדב
export async function trimCorrections(vol, keep = CORRECTIONS_KEEP) {
  const old = await TrainingProofCorrection.find({ vol: oid(vol) }, { _id: 1 }).sort({ at: -1, _id: -1 }).skip(keep).lean();
  if (old.length) await TrainingProofCorrection.deleteMany({ _id: { $in: old.map((d) => d._id) } });
  return old.length;
}

// "החזר לממתינות": התיקון של המנהל בוטל — גם הרשומה שלו
export async function dropCorrections(itemIds) {
  if (!itemIds?.length) return 0;
  const r = await TrainingProofCorrection.deleteMany({ item: { $in: itemIds.map(oid) } });
  return r.deletedCount;
}

// מסנכרן רק פריטים שעדיין קיימים. פריט חסר כבר ירד לתחנה, ולכן הרשומה העצמאית שלו
// תקפה ואסור למחוק אותה. שימושי אחרי unapprove ובקריאת היומן לתיקון כשל קודם.
export async function reconcileCorrections(itemIds) {
  if (!itemIds?.length) return 0;
  const ids = itemIds.map(oid);
  const docs = await TrainingProofItem.find({ _id: { $in: ids } }).lean();
  const live = new Set(docs.map((d) => String(d._id)));
  const valid = docs.filter((d) => d.status === 'approved' && d.adminFixed);
  const invalid = ids.filter((id) => live.has(String(id)) && !valid.some((d) => String(d._id) === String(id)));
  if (invalid.length) await dropCorrections(invalid);
  await syncCorrections(valid);
  return valid.length;
}

// התיקונים של מתנדב, החדשים קודם
export async function listCorrections(vol, { limit = CORRECTIONS_KEEP, section = null } = {}) {
  // משלים יומן שנכשל אחרי שהאישור האטומי כבר הצליח, ומסיר רשומה ישנה של תיקון שבוטל.
  const live = await TrainingProofItem.find({
    vol: oid(vol), adminFixed: true, status: 'approved', correctionLoggedAt: null,
  }).lean();
  await syncCorrections(live);
  const loggedIds = await TrainingProofCorrection.find({ vol: oid(vol) }, { item: 1 }).lean();
  await reconcileCorrections(loggedIds.map((d) => d.item));
  const q = { vol: oid(vol) };
  if (section) q.section = section;
  const docs = await TrainingProofCorrection.find(q).sort({ at: -1, _id: -1 }).limit(limit).lean();
  return docs.map((d) => ({
    id: String(d._id),
    section: d.section,
    alias: d.alias,
    page: d.page,
    track: d.track,
    before: d.before,
    after: d.after,
    changes: d.changes,
    at: d.at,
  }));
}
