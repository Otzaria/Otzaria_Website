import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { markItem } from '@/lib/trainingProof/round';
import { publicItem } from '@/lib/trainingProof/shape';
import { ok, fail, smallBody } from '@/lib/trainingProof/routeUtils';

// POST — סימון אחד, נשמר מיד (docs/75 ה-4):
//   זיהוי: {action:'ok'|'fixed'|'seg'|'skip'|'bad'|'router', text?}
//   נתב:   {label, bad?, words?}
// רק שורה שבסבב של המתנדב, ועוד לא נסקרה. ← {item, skipped?}
export async function POST(request, { params }) {
  const { userId, error } = await requireTrainingProofSession();
  if (error) return error;
  const { body, error: bodyError } = await smallBody(request);
  if (bodyError) return bodyError;
  try {
    const { id } = await params;
    const r = await markItem(userId, id, body);
    if (!r.ok) return fail(r.status, r.error);
    return ok({ item: publicItem(r.item), skipped: !!r.skipped });
  } catch (e) {
    console.error('training-proof mark', e);
    return fail(500, 'השמירה נכשלה — נסו שוב');
  }
}
