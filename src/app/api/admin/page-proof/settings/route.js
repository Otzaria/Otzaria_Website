import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';
import { json, noStore } from '@/lib/pageProof/respond';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';
import { recutStatus, setProofRuntime } from '@/lib/pageProof/runtime';
import { pendingRecutTotals, recutAskCount } from '@/lib/pageProof/recutRequests';
import { proofRuntimePatch, recutEffective } from '@/lib/pageProof/recutRules';

// מתגי הגהת-העמודים (lib/pageProof/runtime.js) — היום: האם מתנדבים יכולים לשלוח לזיהוי-מחדש.
// GET   (session, או מפתח-גישה 'read' — תוכנת-הספר מציגה את המתג) ←
//       {success, settings: {recutRequests: 'on'|'off'|'auto', autoMinutes}, effective: {recutRequests: bool},
//        bookSoftwareSeenAt, pendingRecut: {waiting, picked}, recutAsks — עמודים שממתינים לאישור מנהל לזיהוי-מחדש}
// PATCH {recutRequests?, autoMinutes?} (session, או מפתח 'import') ← אותה צורה.
//       כיבוי אינו נוגע בבקשות שכבר ממתינות ("החזר את כל הממתינים" — recut-requests/release).
// private, no-store.

async function gate(request, scope) {
  const { session, denied: keyDenied } = await getPageProofSession(request, scope);
  if (keyDenied) return { denied: keyDenied };
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return { denied: noStore(denied) };
  return { session };
}

async function reply() {
  const { settings, seenAt } = await recutStatus({ withSeen: true });
  return json({
    success: true,
    settings,
    effective: { recutRequests: recutEffective(settings, seenAt) },
    bookSoftwareSeenAt: seenAt,
    pendingRecut: await pendingRecutTotals(),
    recutAsks: await recutAskCount(),
  });
}

export async function GET(request) {
  const { denied } = await gate(request, 'read');
  if (denied) return denied;
  try {
    await connectDB();
    return await reply();
  } catch (e) {
    console.error('page-proof settings GET', e?.name);
    return noStore(serverError());
  }
}

export async function PATCH(request) {
  const { session, denied } = await gate(request, 'import');
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    const { patch, error } = proofRuntimePatch(body);
    if (error) return noStore(badRequest(error));
    await connectDB();
    await setProofRuntime(patch, session.user);
    return await reply();
  } catch (e) {
    console.error('page-proof settings PATCH', e?.name);
    return noStore(serverError());
  }
}
