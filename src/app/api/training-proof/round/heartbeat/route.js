import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { heartbeat } from '@/lib/trainingProof/round';
import { ok, fail, smallBody, ROUND_SECTIONS } from '@/lib/trainingProof/routeUtils';

// POST {section} — ה"דופק": הדף שולח כל 60 שניות "אני עדיין כאן", והשורות הפתוחות
// שמורות למתנדב עוד 3 דקות (docs/76 §8.2). ← {open} — כמה שורות פתוחות עדיין אצלו
// (0 אחרי הפסקה ארוכה = השורות עברו לאחרים, והדף מציע סבב חדש).
export async function POST(request) {
  const { userId, error } = await requireTrainingProofSession();
  if (error) return error;
  const { body, error: bodyError } = await smallBody(request);
  if (bodyError) return bodyError;
  if (!ROUND_SECTIONS.includes(body.section)) return fail(400, 'חלק לא מוכר');
  try {
    return ok({ open: await heartbeat(userId, body.section) });
  } catch (e) {
    console.error('training-proof heartbeat', e);
    return fail(500, 'הדופק נכשל');
  }
}
