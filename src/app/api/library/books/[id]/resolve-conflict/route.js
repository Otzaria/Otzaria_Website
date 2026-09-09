import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { resolveConflict } from '@/lib/dicta/moderation-service';
import { apiError, notFound, serverError } from '@/lib/apiResponse';

// פתרון קונפליקט סנכרון. body: { strategy: 'ours'|'theirs' }
export async function POST(req, { params }) {
  try {
    const auth = await requireModerator('sync');
    if (auth.error) return apiError(auth.status, auth.error);

    const { id } = await params;
    const { strategy } = await req.json();

    const result = await resolveConflict({ bookId: id, strategy });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return notFound(error.message);
    console.error('Resolve conflict failed:', error);
    return serverError();
  }
}
