import TrainingProofVolunteer from '@/models/TrainingProofVolunteer';
import TrainingProofItem from '@/models/TrainingProofItem';
import TrainingProofBook from '@/models/TrainingProofBook';
import User from '@/models/User';
import { hasOcrAccess } from '@/lib/roles';
import { SECTIONS } from '@/lib/trainingProof/vocab';
import { volunteerStats } from '@/lib/trainingProof/stats';
import { oid } from './http';
import { matchPct } from './rules';

// המתנדבים (docs/75 ה-1, ה-17; docs/76 §8.1): בקשות ממתינות, מגיהים עם גישה (מונים,
// שיעור-התאמה, פעילות אחרונה), הוספה ישירה של משתמש רשום, וביטול גישה — שמחזיר למאגר
// את מה שהמתנדב תפס (שורות בסבב פתוח, וספר-גלאי שלקח). ההגשות שלו שממתינות — נשארות.

const RELEASE = { status: 'available', heldBy: null, heldUntil: null, heldAt: null, round: null };

function userInfo(u) {
  return { name: u?.name || '', email: u?.email || '' };
}

// סיכום מונים לשורה בטבלה: שורות (זיהוי+נתב), עמודי-גלאי, ושיעור-ההתאמה המשוקלל
export function rowStats(stats) {
  if (!stats) return null;
  const sum = (k, secs) => secs.reduce((n, s) => n + (stats[s]?.[k] || 0), 0);
  const judged = sum('approved', SECTIONS) + sum('rejected', SECTIONS);
  return {
    lines: sum('saved', ['ocr', 'router']),
    pages: sum('saved', ['frames']),
    pending: sum('pending', SECTIONS),
    approved: sum('approved', SECTIONS),
    corrected: sum('corrected', SECTIONS),
    rejected: sum('rejected', SECTIONS),
    match: judged ? matchPct(sum('unchanged', SECTIONS) / judged) : null,
    bySection: Object.fromEntries(SECTIONS.map((s) => [s, { ...stats[s], match: matchPct(stats[s]?.match) }])),
  };
}

export async function listVolunteers() {
  const vols = await TrainingProofVolunteer.find({}).sort({ requestedAt: 1 }).lean();
  const users = await User.find({ _id: { $in: vols.map((v) => v.userId) } }, { name: 1, email: 1 }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const approved = vols.filter((v) => v.status === 'approved');
  const [stats, last] = await Promise.all([
    Promise.all(approved.map((v) => volunteerStats(v.userId).catch(() => null))),
    TrainingProofItem.aggregate([
      { $match: { vol: { $in: approved.map((v) => v.userId) } } },
      { $group: { _id: '$vol', at: { $max: '$submittedAt' } } },
    ]),
  ]);
  const lastBy = new Map(last.map((l) => [String(l._id), l.at]));
  return {
    requests: vols
      .filter((v) => v.status === 'pending')
      .map((v) => ({ userId: String(v.userId), ...userInfo(byId.get(String(v.userId))), message: v.requestMessage || '', requestedAt: v.requestedAt })),
    approved: approved.map((v, i) => ({
      userId: String(v.userId),
      ...userInfo(byId.get(String(v.userId))),
      since: v.decidedAt || v.requestedAt,
      last: lastBy.get(String(v.userId)) || null,
      stats: rowStats(stats[i]),
    })),
    others: vols
      .filter((v) => v.status === 'denied' || v.status === 'revoked')
      .map((v) => ({ userId: String(v.userId), ...userInfo(byId.get(String(v.userId))), status: v.status, decidedAt: v.decidedAt })),
  };
}

// מה שהמתנדב תפס חוזר למאגר: שורות בסבב פתוח (כל החלקים), וספר-גלאי שבידיו
export async function releaseHolds(userId) {
  const uid = oid(userId);
  const [items, books] = await Promise.all([
    TrainingProofItem.updateMany({ heldBy: uid, status: 'held' }, { $set: RELEASE }),
    TrainingProofBook.updateMany({ claimedBy: uid }, { $set: { claimedBy: null, claimedUntil: null, lastBy: uid } }),
  ]);
  return { items: items.modifiedCount, books: books.modifiedCount };
}

// החלטה על מתנדב. action: approve (מבקשה/מדחייה/מביטול) · deny (בקשה ממתינה) · revoke (מגיה עם גישה)
const FROM = { approve: ['pending', 'denied', 'revoked'], deny: ['pending'], revoke: ['approved'] };
const TO = { approve: 'approved', deny: 'denied', revoke: 'revoked' };

export async function decide(userId, action, by, now = new Date()) {
  if (!FROM[action]) return { error: 'פעולה לא מוכרת', status: 400 };
  const v = await TrainingProofVolunteer.findOneAndUpdate(
    { userId: oid(userId), status: { $in: FROM[action] } },
    { $set: { status: TO[action], decidedAt: now, decidedBy: oid(by) } },
    { returnDocument: 'after', lean: true }
  );
  if (!v) return { error: 'המצב של המתנדב השתנה בינתיים — רעננו', status: 409 };
  const released = action === 'revoke' ? await releaseHolds(userId) : null;
  return { status: v.status, released };
}

// הוספה ישירה (ה-17): משתמש רשום לפי אימייל (מדויק) או שם (מדויק; רק אם יחיד)
export async function addDirect(query, by, now = new Date()) {
  const q = String(query || '').trim();
  if (!q || q.length > 200) return { error: 'כתבו אימייל או שם-משתמש', status: 400 };
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let users = q.includes('@')
    ? await User.find({ email: new RegExp(`^${esc}$`, 'i') }, { name: 1, email: 1, role: 1 }).limit(2).lean()
    : await User.find({ name: q }, { name: 1, email: 1, role: 1 }).limit(3).lean();
  if (!users.length) return { error: 'לא נמצא משתמש רשום כזה באתר', status: 404 };
  if (users.length > 1) return { error: 'יש כמה משתמשים בשם הזה — כתבו את האימייל', status: 409 };
  const u = users[0];
  if (hasOcrAccess(u.role)) return { error: 'זה מנהל OCR — יש לו גישה ממילא', status: 409 };
  const v = await TrainingProofVolunteer.findOneAndUpdate(
    { userId: u._id },
    {
      $set: { status: 'approved', decidedAt: now, decidedBy: oid(by) },
      $setOnInsert: { userId: u._id, requestMessage: '', requestedAt: now },
    },
    { upsert: true, returnDocument: 'after', lean: true }
  );
  return { userId: String(v.userId), name: u.name || '', email: u.email || '' };
}
