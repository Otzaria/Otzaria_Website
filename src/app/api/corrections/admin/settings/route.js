import { withCorrections } from '../../_shared';
import { readJson } from '@/lib/corrections/http';
import { setSettings } from '@/lib/corrections/admin';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  return withCorrections(request, async ({ user }) => {
    const body = await readJson(request).catch(() => null);
    if (!body) return { status: 400, body: { error: 'invalid_json' } };
    return setSettings({ user, patch: body });
  }, { mutate: true });
}
