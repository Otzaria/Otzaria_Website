import mongoose from 'mongoose';
import TrainingProofItem from '../../models/TrainingProofItem.js';
import TrainingProofPackage from '../../models/TrainingProofPackage.js';
import TrainingProofBook from '../../models/TrainingProofBook.js';
import { currentRound } from './round.js';

// המספרים בדף הבית של המתנדב (docs/75 §2): כמה ממתינות בכל חלק, איפה הסבב שלו עומד,
// ובגלאי — כמה ספרים פנויים וכמה "הופסקו באמצע" אצל אחרים. קריאה בלבד.

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// כמה פריטים פנויים בחלק (בלי חבילות מושהות ובלי מה שהמתנדב דילג עליו או נדחה לו)
export async function poolCount(section, userId, now = new Date()) {
  const closed = await TrainingProofPackage.find({ section, open: false }, { packageId: 1, part: 1 }).lean();
  const match = {
    section,
    $or: [{ status: 'available' }, { status: 'held', heldUntil: { $lt: now } }],
    notFor: { $ne: oid(userId) },
  };
  if (closed.length) match.$nor = closed.map((p) => ({ packageId: p.packageId, part: p.part }));
  return TrainingProofItem.countDocuments(match);
}

// הסבב הנוכחי בקיצור: כמה סומנו מתוך כמה
export async function roundBrief(userId, section) {
  const r = await currentRound(userId, section);
  return { total: r.items.length, open: r.open, done: r.done };
}

// גלאי: ספרים פנויים (איש לא מחזיק, לא הושלמו) ומתוכם — שהתחילו בהם
export async function framesBrief(userId, now = new Date()) {
  const free = { doneBy: null, $or: [{ claimedBy: null }, { claimedUntil: { $lt: now } }] };
  const [available, partial, mine] = await Promise.all([
    TrainingProofBook.countDocuments(free),
    TrainingProofBook.countDocuments({ ...free, lastBy: { $ne: null } }),
    TrainingProofBook.countDocuments({ claimedBy: oid(userId), claimedUntil: { $gte: now } }),
  ]);
  return { available, partial, mine };
}
