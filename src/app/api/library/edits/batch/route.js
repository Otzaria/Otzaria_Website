import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { batchModerate } from '@/lib/dicta/moderation-service';

// אישור/דחייה באצווה. body: { action:'approve'|'reject', ids?:[], patternFilter?:{find, replace} }
export async function POST(req) {
  try {
    const auth = await requireModerator();
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { action, ids, patternFilter } = await req.json();
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'פעולה לא חוקית' }, { status: 400 });
    }

    const result = await batchModerate({ action, ids, patternFilter, moderatorDoc: auth.userDoc });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'BAD_INPUT') return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Batch moderation failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
