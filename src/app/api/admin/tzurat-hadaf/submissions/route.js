import { adminGate } from '@/lib/tzuratHadaf/session';
import { listSubmissions } from '@/lib/tzuratHadaf/admin';
import { fromResult, serverError } from '@/lib/tzuratHadaf/respond';

// GET ?status=&page= ← {submissions:[{id, slug, masechet, daf, userName, round, status, counts, at}], total, page, pages}
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    return fromResult(await listSubmissions({ status: sp.get('status') || '', page: sp.get('page') }));
  } catch (e) {
    console.error('tzurat admin submissions', e);
    return serverError();
  }
}
