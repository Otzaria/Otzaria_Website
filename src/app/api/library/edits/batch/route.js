import { NextResponse } from 'next/server';
import { requireModerator } from '@/lib/dicta/require-moderator';
import { batchModerate } from '@/lib/dicta/moderation-service';
import { apiError, badRequest, serverError } from '@/lib/apiResponse';

// אישור/דחייה באצווה. body: { action:'approve'|'reject', ids?:[], patternFilter?:{find, replace} }
export async function POST(req) {
  try {
    const auth = await requireModerator();
    if (auth.error) return apiError(auth.status, auth.error);

    const { action, ids, patternFilter } = await req.json();
    if (action !== 'approve' && action !== 'reject') {
      return badRequest('פעולה לא חוקית');
    }

    const result = await batchModerate({ action, ids, patternFilter, moderatorDoc: auth.userDoc });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'BAD_INPUT') return badRequest(error.message);
    console.error('Batch moderation failed:', error);
    return serverError();
  }
}
