import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { canProof, canRequest } from '@/lib/trainingProof/accessRules';
import { volunteerStats } from '@/lib/trainingProof/stats';
import { poolCount, roundBrief, framesBrief } from '@/lib/trainingProof/home';
import { ok, fail } from '@/lib/trainingProof/routeUtils';

// GET — דף הבית של "הגהה לאימון המודלים": מצב-הגישה של המשתמש, ולמי שיש גישה —
// המספרים לשלושת החלקים ו"ההגהות שלי". הנתיב היחיד שעונה 200 גם בלי גישה: הדף צריך
// לדעת אם להציג "אין לך הרשאת גישה לדף זה" ואם הבקשה כבר נשלחה. קריאה בלבד.
// ← {access, isAdmin, canRequest, request, sections?, stats?}
export async function GET() {
  const { userId, access, isAdmin, volunteer, error } = await requireTrainingProofSession({ anyone: true });
  if (error) return error;
  try {
    const base = {
      access,
      isAdmin,
      canRequest: canRequest(access),
      request: volunteer ? { status: volunteer.status, requestedAt: volunteer.requestedAt } : null,
    };
    if (!canProof(access)) return ok(base);
    const [ocrPool, routerPool, ocrRound, routerRound, frames, stats] = await Promise.all([
      poolCount('ocr', userId),
      poolCount('router', userId),
      roundBrief(userId, 'ocr'),
      roundBrief(userId, 'router'),
      framesBrief(userId),
      volunteerStats(userId),
    ]);
    return ok({
      ...base,
      sections: {
        ocr: { pool: ocrPool, round: ocrRound },
        router: { pool: routerPool, round: routerRound },
        frames,
      },
      stats,
    });
  } catch (e) {
    console.error('training-proof GET', e);
    return fail(500, 'אירעה שגיאה, נסו שוב מאוחר יותר');
  }
}
