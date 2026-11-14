import { adminGate } from '@/lib/tzuratHadaf/session';
import { listReports } from '@/lib/tzuratHadaf/admin';
import { fromResult, serverError } from '@/lib/tzuratHadaf/respond';

// GET ?status=&category=&slug=&page= ← {reports:[Report + {userName, scanUrl, oursUrl}], total, page, pages}
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    return fromResult(
      await listReports({ status: sp.get('status') || '', category: sp.get('category') || '', slug: sp.get('slug') || '', page: sp.get('page') })
    );
  } catch (e) {
    console.error('tzurat admin reports', e);
    return serverError();
  }
}
