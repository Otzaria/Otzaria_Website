import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';
import { json, noStore } from '@/lib/pageProof/respond';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';
import { releaseAllRecutRequests } from '@/lib/pageProof/recutRequests';

// POST {gid?}: "החזר את כל הממתינים למתנדבים" — כל בקשת-מתנדב לזיהוי-מחדש שעוד לא נמשכה לתוכנת-הספר
// מתבטלת, והעמוד חוזר אל המתנדב שביקש (כמו "שחרור מהמתנה" של עמוד בודד; recutRequests.
// releaseAllRecutRequests). gid — רק בספר הזה. session, או מפתח-גישה 'review' (כמו release_recut).
// ← {success, released, skipped, picked} · private, no-store.
const GID_RE = /^[A-Za-z0-9]{8,64}$/;

export async function POST(request) {
  const { session, denied: keyDenied } = await getPageProofSession(request, 'review');
  if (keyDenied) return keyDenied;
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return noStore(denied);
  try {
    const body = (await request.json().catch(() => null)) || {};
    const gid = body.gid == null || body.gid === '' ? null : String(body.gid);
    if (gid && !GID_RE.test(gid)) return noStore(badRequest('gid לא תקין'));
    await connectDB();
    const reviewer = {
      reviewedBy: session.user.id || session.user._id,
      reviewedByName: session.user.name || '',
      reviewedAt: new Date(),
    };
    return json({ success: true, ...(await releaseAllRecutRequests({ gid, reviewer })) });
  } catch (e) {
    console.error('page-proof recut-requests release POST', e?.name);
    return noStore(serverError());
  }
}
