import { withCorrections } from '../_shared';
import { listHandlers } from '@/lib/corrections/admin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return withCorrections(request, ({ user }) => listHandlers({ user }));
}
