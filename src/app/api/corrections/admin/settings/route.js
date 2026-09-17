import { withCorrections } from '../../_shared';
import { readJson } from '@/lib/corrections/http';
import { setServicePaused } from '@/lib/corrections/admin';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  return withCorrections(request, async ({ user }) => {
    const body = await readJson(request).catch(() => null);
    if (!body) return { status: 400, body: { error: 'invalid_json' } };
    return setServicePaused({ user, paused: body.verifyPaused });
  }, { mutate: true });
}
