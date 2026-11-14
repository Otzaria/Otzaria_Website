import { adminGate } from '@/lib/tzuratHadaf/session';
import { listBatches } from '@/lib/tzuratHadaf/admin';
import { json, serverError } from '@/lib/tzuratHadaf/respond';

// GET — החבילות שיובאו (מסכת × בנייה) ← {batches:[{slug, masechet, order, buildId, pages, items, status, importedAt}]}
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    return json({ batches: await listBatches() });
  } catch (e) {
    console.error('tzurat admin batches', e);
    return serverError();
  }
}
