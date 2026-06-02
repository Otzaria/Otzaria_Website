import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { setUserBlock } from '@/lib/dicta/moderation-service';

// חסימה/שחרור משתמש מעריכה במרחב. body: { blocked:boolean, reason?, rejectPending?:boolean }
export async function POST(req, { params }) {
  try {
    const auth = await requireModerator();
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const { blocked, reason, rejectPending } = await req.json();

    const result = await setUserBlock({
      userId: id,
      blocked: !!blocked,
      reason,
      rejectPending: !!rejectPending,
      moderatorDoc: auth.userDoc,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    console.error('Block user failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
