import { withCorrections } from '../_shared';
import { listFilterOptions } from '@/lib/corrections/volunteer';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return withCorrections(request, ({ user }) => listFilterOptions({ user }));
}
