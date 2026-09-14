import { withCorrections } from '../../_shared';
import { computeHealth } from '@/lib/corrections/health';
import { canManageCorrections } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return withCorrections(request, async ({ user, config }) => {
    if (!canManageCorrections(user)) return { status: 403, body: { error: 'Forbidden' } };
    return { status: 200, body: await computeHealth({ config }) };
  });
}
