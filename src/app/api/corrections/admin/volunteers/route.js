import { withCorrections } from '../../_shared';
import { readJson } from '@/lib/corrections/http';
import { searchUsers, setVolunteer } from '@/lib/corrections/admin';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const q = new URL(request.url).searchParams.get('q');
  return withCorrections(request, ({ user }) => searchUsers({ user, q }));
}

export async function POST(request) {
  return withCorrections(request, async ({ user }) => {
    const body = await readJson(request).catch(() => null);
    if (!body) return { status: 400, body: { error: 'invalid_json' } };
    return setVolunteer({ user, targetUserId: body.userId, value: body.isCorrectionsVolunteer });
  }, { mutate: true });
}
