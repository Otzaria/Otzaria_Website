import { withCorrections } from '../../_shared';
import { getReportDetail } from '@/lib/corrections/volunteer';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  return withCorrections(request, ({ user, config }) => getReportDetail({ user, id, config }));
}
