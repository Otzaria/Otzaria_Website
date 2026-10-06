import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';
import { releaseClaims } from '@/lib/pageProof/adminPages';
import { fromResult, noStore } from '@/lib/pageProof/respond';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';

// POST {ids} | {scope:'expired'|'all'}: שחרור תפיסות בידי מנהל — גם כשהמתנדב
// עוד מחזיק בעמוד (למשל תפיסה "תקועה"). ids — העמודים האלה; 'expired' — כל
// התפיסות שפגו ועוד רשומות בספר; 'all' — כל התפיסות בספר.
// ← {success, released}. טיוטה שהמתנדב לא הגיש שמורה באתר ועוברת עם העמוד
// (serverDrafts.js — הממשק מסביר לפני). רק מנהל OCR — גם במפתח-גישה של תוכנת-הספר (review). private, no-store.

const GID_RE = /^[A-Za-z0-9]{8,64}$/;

export async function POST(request, { params }) {
  const { session, denied: keyDenied } = await getPageProofSession(request, 'review');
  if (keyDenied) return noStore(keyDenied);
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
