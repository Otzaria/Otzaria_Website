import { adminGate } from '@/lib/tzuratHadaf/session';
import { listItems } from '@/lib/tzuratHadaf/admin';
import { fromResult, serverError } from '@/lib/tzuratHadaf/respond';

// GET ?status=&slug=&kind=&page= — החלטות הנוסח (למשל disputed/flagged) ← {items:[AdminItem], total, page, pages}
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    return fromResult(await listItems({ status: sp.get('status') || '', slug: sp.get('slug') || '', kind: sp.get('kind') || '', page: sp.get('page') }));
  } catch (e) {
    console.error('tzurat admin items', e);
    return serverError();
  }
}
