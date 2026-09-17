import { withCorrections } from '../../_shared';
import { getReportDetail } from '@/lib/corrections/volunteer';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  // ?context=N — הרחבת ההקשר בתצוגת ה-diff (נחסם לתקרה בשרת).
  const contextLines = new URL(request.url).searchParams.get('context');
  return withCorrections(request, ({ user, config }) => getReportDetail({ user, id, config, contextLines }));
}
