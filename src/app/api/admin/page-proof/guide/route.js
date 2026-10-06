import mongoose from 'mongoose';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';
import { json, noStore } from '@/lib/pageProof/respond';
import { readJsonBody, tooBigResponse } from '@/lib/pageProof/pool';
import { getPageProofSession } from '@/lib/pageProof/tokenAuth';
import { DEFAULT_GUIDE_HTML, MAX_GUIDE_HTML, guideCodes, guideInput, renderGuide } from '@/lib/pageProof/guideContent';
import { loadGuideFresh, resetGuide, saveGuide } from '@/lib/pageProof/guideStore';

// דף ההנחיות להגהת עמודים (/docs/page-proof) — עריכה מדף הניהול, בלי בקשת-שינוי לקוד (בעל הפרויקט, 2026-10-06).
// GET    ← {success, saved: {html, byName, at} | null, default — הנוסח המקורי, codes — האיורים/הכפתורים/הערכים}
// PUT    {html, preview?} ← preview: {success, preview: {html, toc, unknown}} בלי לשמור; אחרת שמירה ← {success, html, at}
// DELETE ← חזרה לנוסח המקורי
// רק מנהל OCR (session, או מפתח-גישה של תוכנת-הספר: read לקריאה, review לשינוי); מתנדב ← 403. private, no-store.
// התוכן מנוקה לרשימת-היתר (guideContent.sanitizeGuideHtml) לפני שמירה ולפני הצגה.

async function gate(request, scope) {
  const { session, denied: keyDenied } = await getPageProofSession(request, scope);
  if (keyDenied) return { denied: noStore(keyDenied) };
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return { denied: noStore(denied) };
  return { session };
}

export async function GET(request) {
  const { denied } = await gate(request, 'read');
  if (denied) return denied;
  try {
    return json({ success: true, saved: await loadGuideFresh(), default: DEFAULT_GUIDE_HTML, codes: guideCodes() });
  } catch (e) {
    console.error('page-proof guide GET', e?.name);
    return noStore(serverError());
  }
}

export async function PUT(request) {
  const { session, denied } = await gate(request, 'review');
  if (denied) return denied;
  try {
    const { body, tooBig } = await readJsonBody(request, MAX_GUIDE_HTML + 4096);
    if (tooBig) return noStore(tooBigResponse());
    if (!body || typeof body !== 'object' || Array.isArray(body)) return noStore(badRequest('גוף הבקשה חסר'));
    if (body.preview) {
      const v = guideInput(body.html);
      if (v.error) return noStore(badRequest(v.error));
      return json({ success: true, preview: renderGuide(v.html) });
    }
    const uid = String(session.user?.id || session.user?._id || '');
    const r = await saveGuide(body.html, { userId: mongoose.Types.ObjectId.isValid(uid) ? new mongoose.Types.ObjectId(uid) : null, userName: session.user?.name || '' });
    if (!r.ok) return noStore(badRequest(r.error));
    return json({ success: true, html: r.html, at: r.at, unknown: renderGuide(r.html).unknown });
  } catch (e) {
    console.error('page-proof guide PUT', e?.name);
    return noStore(serverError());
  }
}

export async function DELETE(request) {
  const { denied } = await gate(request, 'review');
  if (denied) return denied;
  try {
    await resetGuide();
    return json({ success: true });
  } catch (e) {
    console.error('page-proof guide DELETE', e?.name);
    return noStore(serverError());
  }
}
