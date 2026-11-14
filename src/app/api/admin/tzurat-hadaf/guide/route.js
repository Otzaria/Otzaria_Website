import mongoose from 'mongoose';
import { adminGate } from '@/lib/tzuratHadaf/session';
import { DEFAULT_GUIDE_HTML, MAX_GUIDE_HTML, guideCodes, guideInput, renderGuide } from '@/lib/tzuratHadaf/guideContent';
import { loadGuideFresh, resetGuide, saveGuide } from '@/lib/tzuratHadaf/guideStore';
import { json, badRequest, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// דף ההנחיות של צורת הדף (/docs/tzurat-hadaf) — כמו בהגהת עמודים:
// GET    ← {saved: {html, byName, at} | null, default, codes}
// PUT    {html, preview?} ← preview: {preview: {html, toc, unknown}} בלי לשמור; אחרת שמירה ← {html, at, unknown}
// DELETE ← חזרה לנוסח המקורי
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    return json({ saved: await loadGuideFresh(), default: DEFAULT_GUIDE_HTML, codes: guideCodes() });
  } catch (e) {
    console.error('tzurat guide GET', e?.name);
    return serverError();
  }
}

export async function PUT(request) {
  const { session, denied } = await adminGate(request, 'review');
  if (denied) return denied;
  try {
    const { body, tooBig } = await readJsonBody(request, MAX_GUIDE_HTML + 4096);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('גוף הבקשה חסר');
    if (body.preview) {
      const v = guideInput(body.html);
      if (v.error) return badRequest(v.error);
      return json({ preview: renderGuide(v.html) });
    }
    const uid = String(session.user?.id || session.user?._id || '');
    const r = await saveGuide(body.html, {
      userId: mongoose.Types.ObjectId.isValid(uid) ? new mongoose.Types.ObjectId(uid) : null,
      userName: session.user?.name || '',
    });
    if (!r.ok) return badRequest(r.error);
    return json({ html: r.html, at: r.at, unknown: renderGuide(r.html).unknown });
  } catch (e) {
    console.error('tzurat guide PUT', e?.name);
    return serverError();
  }
}

export async function DELETE(request) {
  const { denied } = await adminGate(request, 'review');
  if (denied) return denied;
  try {
    await resetGuide();
    return json({ ok: true });
  } catch (e) {
    console.error('tzurat guide DELETE', e?.name);
    return serverError();
  }
}
