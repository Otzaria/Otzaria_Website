import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { resolveConflictHunk } from '@/lib/dicta/moderation-service';
import { apiError, badRequest, notFound, serverError } from '@/lib/apiResponse';

// פתרון קונפליקט סנכרון מקטע-מקטע. body: { before, after, strategy: 'ours'|'theirs' }
// before/after = התוכן המלא של ה-hunk (גיטהאב/האתר), לזיהוי המקטע ללא תלות באינדקס.
export async function POST(req, { params }) {
  try {
    const auth = await requireModerator('sync');
    if (auth.error) return apiError(auth.status, auth.error);

    const { id } = await params;

    let body;
    try {
      body = await req.json();
    } catch {
      return badRequest('גוף הבקשה אינו JSON תקין');
    }
    const { before, after, strategy } = body;

    const result = await resolveConflictHunk({ bookId: id, before, after, strategy });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'NOT_FOUND') return notFound(error.message);
    if (error.code === 'BAD_INPUT' || error.code === 'APPLY_FAILED') {
      return badRequest(error.message);
    }
    if (error.code === 'CONFLICT_RETRY') return apiError(409, error.message);
    console.error('Resolve conflict hunk failed:', error);
    return serverError();
  }
}
