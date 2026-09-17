import { withCorrections } from '../_shared';
import { listReports } from '@/lib/corrections/volunteer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  return withCorrections(request, ({ user }) => listReports({ user, query }));
}
