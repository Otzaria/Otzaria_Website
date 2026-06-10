import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { pushLibraryToGitHub } from '@/lib/dicta/library-sync';

export const maxDuration = 300;

// כפיית סנכרון מיידי (דחיפה לגיטהאב) — מנהלי ספרים בלבד. body: { force?: boolean }
export async function POST(req) {
  try {
    const auth = await requireModerator('sync');
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    const result = await pushLibraryToGitHub({ force });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'NO_TOKEN') return NextResponse.json({ error: error.message, code: 'NO_TOKEN' }, { status: 400 });
    console.error('Manual push sync failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
