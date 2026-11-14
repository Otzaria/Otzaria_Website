import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { releaseRound } from '@/lib/trainingProof/round';
import { ok, fail, smallBody, ROUND_SECTIONS } from '@/lib/trainingProof/routeUtils';

// POST {section} — יציאה מהדף (navigator.sendBeacon ביציאה, או "סיום להיום"): השורות שלא
// סומנו חוזרות למאגר מיד, ולא אחרי 3 דקות. מה שסומן נשאר (docs/75 ה-4). ← {released}
export async function POST(request) {
  const { userId, error } = await requireTrainingProofSession();
  if (error) return error;
  const { body, error: bodyError } = await smallBody(request);
  if (bodyError) return bodyError;
  if (!ROUND_SECTIONS.includes(body.section)) return fail(400, 'חלק לא מוכר');
  try {
    return ok({ released: await releaseRound(userId, body.section) });
  } catch (e) {
    console.error('training-proof release', e);
    return fail(500, 'השחרור נכשל');
  }
}
