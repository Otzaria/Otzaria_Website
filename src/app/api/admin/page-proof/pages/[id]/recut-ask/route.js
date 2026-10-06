import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';
import { decideRecutAsk } from '@/lib/pageProof/recutRequests';
import { readJsonBody, tooBigResponse } from '@/lib/pageProof/pool';
import { fromResult, noStore } from '@/lib/pageProof/respond';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';

// POST {action: 'approve'|'reject', note?}: בקשה של מתנדב לזיהוי-מחדש שממתינה לאישור המנהל (העמוד במצב 'recut_ask' —
// recutRules.recutRoute; בעל הפרויקט, 2026-10-06: "נעול עד אחרי הזיהוי-מחדש, ובמקרה הצורך באישור מנהל").
//   approve — העמוד ממתין לזיהוי-מחדש ('recut') עם בקשה בשם המתנדב, וחוזר אליו לשלב הטקסט כשיזוהה מחדש;
//   reject  — העמוד חוזר אל המתנדב ('open', התפיסה מתחדשת) לשלב הטקסט, ותיקוני-החיתוך יוצאים עם ההגשה.
// ← {success, decision} · 400 · 404 · 409 (העמוד אינו ממתין לאישור). רק מנהל OCR — גם במפתח-גישה של תוכנת-הספר
// (review); מתנדב ← 403. private, no-store.
const MAX_BODY = 4 * 1024;

export async function POST(request, { params }) {
  const { session, denied: keyDenied } = await getPageProofSession(request, 'review');
  if (keyDenied) return noStore(keyDenied);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return noStore(denied);
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return noStore(badRequest('מזהה עמוד לא תקין'));
    const { body, tooBig } = await readJsonBody(request, MAX_BODY);
    if (tooBig) return noStore(tooBigResponse());
    if (!body || typeof body !== 'object' || Array.isArray(body)) return noStore(badRequest('גוף הבקשה חסר'));
    if (body.action !== 'approve' && body.action !== 'reject') return noStore(badRequest('פעולה לא מוכרת — approve או reject'));
    await connectDB();
    const reviewer = {
      reviewedByName: session.user?.name || 'מנהל',
      ...(mongoose.Types.ObjectId.isValid(String(session.user?._id || session.user?.id || '')) ? { reviewedBy: new mongoose.Types.ObjectId(String(session.user._id || session.user.id)) } : {}),
    };
    return fromResult(await decideRecutAsk(id, body.action, reviewer, { note: typeof body.note === 'string' ? body.note : '' }));
  } catch (e) {
    console.error('admin page-proof recut-ask POST', e);
    return noStore(serverError());
  }
}
