import TrainingProofGuide from '@/models/TrainingProofGuide';
import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { isSection } from '@/lib/trainingProof/vocab';
import { ok, fail } from '@/lib/trainingProof/routeUtils';

// GET — הוראות-ההגהה של חלק (ocr/router/frames), כפי שבעל הפרויקט ערך במסך הניהול.
// העריכה — במסכי הניהול (/api/admin/training-proof). ← {markdown, updatedAt}
export async function GET(request, { params }) {
  const { error } = await requireTrainingProofSession();
  if (error) return error;
  const { section } = await params;
  if (!isSection(section)) return fail(400, 'חלק לא מוכר');
  try {
    const g = await TrainingProofGuide.findOne({ section }, { markdown: 1, updatedAt: 1 }).lean();
    return ok({ markdown: g?.markdown || '', updatedAt: g?.updatedAt || null });
  } catch (e) {
    console.error('training-proof guide', e);
    return fail(500, 'טעינת ההוראות נכשלה');
  }
}
