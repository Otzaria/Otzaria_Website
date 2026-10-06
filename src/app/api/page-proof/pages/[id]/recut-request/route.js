import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireProofSession, readJsonBody } from '@/lib/pageProof/pool';
import PageProofPage from '@/models/PageProofPage';
import { askRecut, pendingRecutCount, requestRecut } from '@/lib/pageProof/recutRequests';
import { markRecutSent } from '@/lib/pageProof/serverDrafts';
import { recutStatus } from '@/lib/pageProof/runtime';
import { RECUT_RATE, RECUT_MSG, recutRoute } from '@/lib/pageProof/recutRules';
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
// נעול עד אחרי הזיהוי-מחדש (בעל הפרויקט, 2026-10-06; recutRules.recutRoute): כשאי אפשר לשלוח בלי מנהל — המתג כבוי,
// תקרת הבקשות, הגשה של מתנדב אחר — הבקשה נשמרת לאישור מנהל (recutRequests.askRecut; העמוד 'recut_ask', נעול), ולא
// נדחית. "אוטומטי" כשתוכנת-הספר לא מחוברת — לתור הרגיל, עד שתתחבר.
// ← {success, submissionId, opCount, pending} · {success, asked:true, reason, opCount, message} (ממתין לאישור מנהל) ·
//   400 (אין תיקוני-חיתוך / פעולה לא תקינה) · 409 (העמוד אינו בטיפולו / הוחלף / כבר ממתין) · 413 · 429.
//   הכול private, no-store.
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
    const userName = session.user?.name || '';
    // לבד או לאישור מנהל (מתג המנהל — runtime.js; תקרת הבקשות; הגשה של מתנדב אחר)
    const [page, status, pending] = await Promise.all([
      PageProofPage.findById(id, { status: 1, revision: 1, leasedBy: 1, leasedUntil: 1, submitters: 1, activeCount: 1 }).lean(),
      recutStatus(),
      pendingRecutCount(userId),
    ]);
    const route = recutRoute(page, userId, { mode: status.settings.recutRequests, pending });
    if (route.error) return json({ success: false, error: route.error || RECUT_MSG.reload }, page ? 409 : 404);
    if (route.route === 'ask') return fromResult(await askRecut(id, userId, { revision, ops: body.ops, userName, reason: route.reason }));
    const r = await requestRecut(id, userId, { revision, ops: body.ops, userName });
    // הטיוטה שבשרת (docs/63 §3): כשהעמוד יחזור — שלב "טקסט"
    if (r.ok) await markRecutSent(id, userId).catch((e) => console.error('page-proof recut-request markRecutSent', e?.name));
    return fromResult(r);
  } catch (e) {
    console.error('page-proof recut-request POST', e);
    return noStore(serverError());
  }
}
