import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { adminBookPages, setVolunteer } from '@/lib/pageProof/adminPages';
import { fromResult, json, noStore } from '@/lib/pageProof/respond';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';

// רשת-העמודים של ספר בניהול הגהת-העמודים (lib/pageProof/adminPages.js).
// GET   ← {success, book, pages, counts} — כל העמודים: מצב, מי מחזיק ועד מתי, פתוח/סגור למתנדבים
//       (גם במפתח-גישה של תוכנת-הספר, read — שם מוצאים עמודים שממתינים לזיהוי-מחדש: state 'recut')
// PATCH {volunteer, ids? | from?+to?, others?} ← {success, changed, open, closed}
//       המתג "פתוח למתנדבים" לעמודים/לטווח/לכל הספר; others — לכל השאר
//       ("עמודים 1–20 פתוחים, וסגור את כל השאר": {volunteer:true, from:1, to:20, others:false})
//       גם במפתח-גישה של תוכנת-הספר (import — פרסום עמודים להגהה: התוכנה מחליטה אילו עמודים
//       מוצעים למתנדבים).
// רק מנהל OCR (כמו כל /api/admin/page-proof). הכול private, no-store.

const GID_RE = /^[A-Za-z0-9]{8,64}$/;

// auth: getPageProofSession(request, scope)
async function gate(params, auth) {
  const { session, denied: keyDenied } = await auth;
  if (keyDenied) return { denied: noStore(keyDenied) };
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return { denied: noStore(denied) };
  const { gid } = await params;
  if (!GID_RE.test(String(gid))) return { denied: noStore(badRequest('gid לא תקין')) };
  return { gid };
}

export async function GET(request, { params }) {
  const { gid, denied } = await gate(params, getPageProofSession(request, 'read'));
  if (denied) return denied;
  try {
    await connectDB();
    const data = await adminBookPages(gid);
    if (!data) return noStore(notFound('הספר לא נמצא'));
    return json({ success: true, ...data });
  } catch (e) {
    console.error('admin page-proof pages GET', e);
    return noStore(serverError());
  }
}

export async function PATCH(request, { params }) {
  const { gid, denied } = await gate(params, getPageProofSession(request, 'import'));
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return noStore(badRequest('גוף הבקשה חסר'));
    await connectDB();
    const { volunteer, ids = null, from = null, to = null, others = null } = body;
    return fromResult(await setVolunteer(gid, { volunteer, ids, from, to, others }));
  } catch (e) {
    console.error('admin page-proof pages PATCH', e);
    return noStore(serverError());
  }
}
