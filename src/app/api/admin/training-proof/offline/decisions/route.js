import { adminGate, ok, fail, jsonBody, crash } from '../../_lib/http';
import { applyDecisions } from '../../_lib/offline';
import { checkDecisionsFile } from '@/lib/trainingProof/offline/contract';

export const maxDuration = 300;

// "אישור בלי אינטרנט" (docs/115 §6) — העלאת קובץ-ההחלטות (tpd/1).
// POST <תוכן הקובץ> ← {approved, fixed, rejected, skipped:{סיבה:n}, skippedList, total}
// החלטה מוחלת רק כשהפריט עדיין ממתין וזמן-ההגשה שלו זהה לזה שבקובץ; כל השאר "דולג" עם סיבה.
// העלאה חוזרת של אותו קובץ — בטוחה (מה שהוחל נספר "כבר אושר באתר" / "כבר לא ממתין").
export async function POST(request) {
  const { userId, error } = await adminGate();
  if (error) return error;
  const { body, error: bad } = await jsonBody(request, 16 * 1024 * 1024);
  if (bad) return bad;
  const file = checkDecisionsFile(body);
  if (file.error) return fail(400, file.error);
  try {
    const report = await applyDecisions(file.section, file.decisions, userId);
    return ok({ section: file.section, offlineId: file.offlineId, ...report });
  } catch (e) {
    return crash('offline decisions', e, 'ההחלה נכשלה באמצע — אפשר להעלות שוב את אותו קובץ; מה שכבר הוחל לא יוחל פעמיים');
  }
}
