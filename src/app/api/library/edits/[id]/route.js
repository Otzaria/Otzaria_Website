import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { approveEdit, rejectEdit, moderateChanges } from '@/lib/dicta/moderation-service';

// אישור / דחייה של הצעה.
//   body: { action: 'approve'|'reject', note? }                 — ההצעה כולה
//   body: { action: 'moderate-changes', approve:[], reject:[], note? } — מקטעים נבחרים (אישור חלקי)
export async function POST(req, { params }) {
  try {
    const auth = await requireModerator();
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;
    const { action, note, approve, reject } = await req.json();

    if (action === 'approve') {
      const result = await approveEdit({ editId: id, moderatorDoc: auth.userDoc });
      return NextResponse.json(result);
    }
    if (action === 'reject') {
      const result = await rejectEdit({ editId: id, moderatorDoc: auth.userDoc, note });
      return NextResponse.json(result);
    }
    if (action === 'moderate-changes') {
      const result = await moderateChanges({ editId: id, approve, reject, moderatorDoc: auth.userDoc, note });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: 'פעולה לא חוקית' }, { status: 400 });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === 'BAD_INPUT') return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === 'RETRY') return NextResponse.json({ error: error.message, code: 'RETRY' }, { status: 409 });
    console.error('Edit moderation failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
