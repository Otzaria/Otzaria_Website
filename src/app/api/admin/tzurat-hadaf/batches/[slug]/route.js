import { adminGate } from '@/lib/tzuratHadaf/session';
import { setBatchStatus } from '@/lib/tzuratHadaf/admin';
import { badRequest, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// PATCH {status:'active'|'paused'} — השהיית מסכת (לא במסלול המהיר ולא לתפיסה חדשה) או חידושה ← {batch}
export async function PATCH(request, { params }) {
  const { denied } = await adminGate(request, 'import');
  if (denied) return denied;
  try {
    const { slug } = await params;
    const { body, tooBig } = await readJsonBody(request, 4096);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    return fromResult(await setBatchStatus(slug, body.status));
  } catch (e) {
    console.error('tzurat admin batch PATCH', e);
    return serverError();
  }
}
