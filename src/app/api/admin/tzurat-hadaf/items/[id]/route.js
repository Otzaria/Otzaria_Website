import { adminGate } from '@/lib/tzuratHadaf/session';
import { adminItemAction } from '@/lib/tzuratHadaf/items';
import { adminItem } from '@/lib/tzuratHadaf/admin';
import { json, badRequest, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// PATCH {action:'resolve', verdict, text?} | {action:'reopen'} | {action:'unflag'} | {action:'obsolete'} ← {item: AdminItem}
// הכרעת מנהל מזכה (פעם אחת) את מי שענה כמוה.
export async function PATCH(request, { params }) {
  const { admin, denied } = await adminGate(request, 'review');
  if (denied) return denied;
  try {
    const { id } = await params;
    const { body, tooBig } = await readJsonBody(request, 8192);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    const r = await adminItemAction(id, body, admin);
    if (!r.ok) return fromResult(r);
    return json({ item: await adminItem(id) });
  } catch (e) {
    console.error('tzurat admin item PATCH', e);
    return serverError();
  }
}
