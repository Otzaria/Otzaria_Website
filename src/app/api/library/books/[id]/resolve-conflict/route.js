import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { resolveConflict } from '@/lib/dicta/moderation-service';

// פתרון קונפליקט סנכרון. body: { strategy: 'ours'|'theirs' }
export async function POST(req, { params }) {
  try {
    const auth = await requireModerator('sync');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const { strategy } = await req.json();

    const result = await resolveConflict({ bookId: id, strategy });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    console.error('Resolve conflict failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
