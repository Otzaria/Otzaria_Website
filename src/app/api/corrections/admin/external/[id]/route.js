import { withCorrections } from '../../../_shared';
import { readJson } from '@/lib/corrections/http';
import { externalTransition } from '@/lib/corrections/volunteer';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id } = await params;
  return withCorrections(request, async ({ user }) => {
    const body = await readJson(request).catch(() => null);
    if (!body) return { status: 400, body: { error: 'invalid_json' } };
    return externalTransition({ user, id, generation: body.generation, action: body.action, note: body.note });
  }, { mutate: true });
}
