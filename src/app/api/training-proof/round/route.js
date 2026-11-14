import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { currentRound, takeRound } from '@/lib/trainingProof/round';
import { publicItem } from '@/lib/trainingProof/shape';
import { ok, fail, smallBody, ROUND_SECTIONS } from '@/lib/trainingProof/routeUtils';

// הסבב של 30 בזיהוי-הטקסט ובנתב (docs/76 §8.2).
//   GET ?section=ocr|router — הסבב הנוכחי (קריאה בלבד; אחרי רענון הדף)
//   POST {section}          — סבב חדש. אם יש עוד שורות פתוחות — חוזר הסבב הקיים (resumed)
// ← {round, items[], open, done, resumed?}

const shape = (r) => ({ round: r.round, items: r.items.map(publicItem), open: r.open, done: r.done });

export async function GET(request) {
  const { userId, error } = await requireTrainingProofSession();
  if (error) return error;
  const section = new URL(request.url).searchParams.get('section');
  if (!ROUND_SECTIONS.includes(section)) return fail(400, 'חלק לא מוכר');
  try {
    return ok(shape(await currentRound(userId, section)));
  } catch (e) {
    console.error('training-proof round GET', e);
    return fail(500, 'טעינת הסבב נכשלה — נסו שוב');
  }
}

export async function POST(request) {
  const { userId, error } = await requireTrainingProofSession();
  if (error) return error;
  const { body, error: bodyError } = await smallBody(request);
  if (bodyError) return bodyError;
  if (!ROUND_SECTIONS.includes(body.section)) return fail(400, 'חלק לא מוכר');
  try {
    const r = await takeRound(userId, body.section);
    if (!r.ok) return fail(r.status, r.error);
    return ok({ ...shape(r), resumed: r.resumed });
  } catch (e) {
    console.error('training-proof round POST', e);
    return fail(500, 'לקיחת הסבב נכשלה — נסו שוב');
  }
}
