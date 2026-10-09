import { requireAppReportsAccess, jsonNoStore } from '@/lib/app-reports/route-auth';
import { getReportDetail } from '@/lib/app-reports/service';
import { getProduct } from '@/lib/app-reports/products';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const auth = await requireAppReportsAccess();
  if (!auth.ok) return auth.response;
  try {
    const { reportId } = await params;
    const detail = await getReportDetail(String(reportId), auth.user.role);
    if (!detail) return jsonNoStore({ error: 'Report not found' }, 404);
    return jsonNoStore({ success: true, ...detail, canSeeEmail: auth.user.role === 'admin', github: { repo: getProduct(detail.report.product).repo } });
  } catch (error) {
    console.error('App report detail failed:', error?.message);
    return jsonNoStore({ error: 'Failed to load report' }, 500);
  }
}
