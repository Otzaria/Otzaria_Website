import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireProofSession, readJsonBody } from '@/lib/pageProof/pool';
import { requestRecut } from '@/lib/pageProof/recutRequests';
import { RECUT_MSG, RECUT_RATE } from '@/lib/pageProof/recutRules';
import { checkRateLimit } from '@/lib/rate-limit';
import { fromResult, json, noStore } from '@/lib/pageProof/respond';
import { badRequest, serverError } from '@/lib/apiResponse';

// POST {revision, ops}: "שלח לזיהוי-מחדש" — המתנדב שולח בעצמו עמוד שתיקן בו חיתוך, בלי לחכות
// להגשה ולאישור מנהל (lib/pageProof/recutRequests.js; הכללים — recutRules.js).
//   • רק עמוד שבטיפולו (התפיסה בתוקף), בגרסה שנפתחה בעורך (revision — חובה), שלא הגיש ושאין לו
//     הגשה של מתנדב אחר;
//   • השרת שומר רק את פעולות-החיתוך (פיצול / איחוד / שורה חדשה / תיבה), אחרי אותה בדיקה של הגשה
//     (sanitizeOps ← packOps ← validateOps); שאר התיקונים נשארים בטיוטה שלו להגשה הרגילה;
//   • בקשה אחת ממתינה לעמוד (העמוד עובר ל-'recut'), עד MAX_PENDING_RECUT למתנדב, והאטה למשתמש.
// הבקשה ממתינה באתר עד שתוכנת-הספר מושכת אותה (fixes?pages=recut&mark=1) ומחזירה גרסה חדשה —
// ואז העמוד חוזר אליו. מנהל מבטל ב"שחרור מהמתנה" (release_recut).
// ← {success, submissionId, opCount, pending} · 400 (אין תיקוני-חיתוך / פעולה לא תקינה) ·
//   409 (העמוד אינו בטיפולו / הוחלף / כבר ממתין / תקרה) · 413 · 429. הכול private, no-store.
export async function POST(request, { params }) {
  const { session, userId, error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return noStore(badRequest('מזהה עמוד לא תקין'));
    const { body, tooBig } = await readJsonBody(request);
    if (tooBig) return json({ success: false, error: 'הבקשה גדולה מדי' }, 413);
    if (!body || typeof body !== 'object' || !Array.isArray(body.ops)) return noStore(badRequest('רשימת תיקונים חסרה'));
    if (!checkRateLimit(`user:${userId}`, 'page-proof-recut-request', RECUT_RATE.tokens, RECUT_RATE.interval)) {
      return json({ success: false, error: RECUT_MSG.rate }, 429);
    }
    await connectDB();
    const revision = Number.isInteger(body.revision) ? body.revision : null;
    return fromResult(await requestRecut(id, userId, { revision, ops: body.ops, userName: session.user?.name || '' }));
  } catch (e) {
    console.error('page-proof recut-request POST', e);
    return noStore(serverError());
  }
}
