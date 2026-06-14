import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { resolveConflictHunk } from '@/lib/dicta/moderation-service';

// פתרון קונפליקט סנכרון מקטע-מקטע. body: { before, after, strategy: 'ours'|'theirs' }
// before/after = התוכן המלא של ה-hunk (גיטהאב/האתר), לזיהוי המקטע ללא תלות באינדקס.
export async function POST(req, { params }) {
  try {
    const auth = await requireModerator('sync');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'גוף הבקשה אינו JSON תקין' }, { status: 400 });
    }
    const { before, after, strategy } = body;

    const result = await resolveConflictHunk({ bookId: id, before, after, strategy });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === 'BAD_INPUT' || error.code === 'APPLY_FAILED') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error.code === 'CONFLICT_RETRY') return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Resolve conflict hunk failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
