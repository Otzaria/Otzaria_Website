import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';
import { releaseClaims } from '@/lib/pageProof/adminPages';
import { fromResult, noStore } from '@/lib/pageProof/respond';

// POST {ids} | {scope:'expired'|'all'}: שחרור תפיסות בידי מנהל — גם כשהמתנדב
// עוד מחזיק בעמוד (למשל תפיסה "תקועה"). ids — העמודים האלה; 'expired' — כל
// התפיסות שפגו ועוד רשומות בספר; 'all' — כל התפיסות בספר.
// ← {success, released}. טיוטה שהמתנדב לא הגיש נשארת רק בדפדפן שלו (הממשק
// מזהיר לפני). רק מנהל OCR. private, no-store.

const GID_RE = /^[A-Za-z0-9]{8,64}$/;

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return noStore(denied);
  try {
    const { gid } = await params;
    if (!GID_RE.test(String(gid))) return noStore(badRequest('gid לא תקין'));
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return noStore(badRequest('גוף הבקשה חסר'));
    await connectDB();
    return fromResult(await releaseClaims(gid, { ids: body.ids ?? null, scope: body.scope ?? null }));
  } catch (e) {
    console.error('admin page-proof release POST', e);
    return noStore(serverError());
  }
}
