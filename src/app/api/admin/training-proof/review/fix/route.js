import { adminGate, ok, fail, jsonBody, validId, crash } from '../../_lib/http';
import { fixAndApprove } from '../../_lib/review';

// POST {id, mark} ← {item, fixed} — "תקן ואשר" (docs/75 ה-11). mark בצורה של סימון-מתנדב:
// זיהוי {action, text}, נתב {label, bad, words}. נבדק ב-MARK_CHECKS כמו סימון של מתנדב;
// תיקון זהה למה שהמתנדב סימן = אישור רגיל (adminFixed נשאר false).
export async function POST(request) {
  const { userId, error } = await adminGate();
  if (error) return error;
  const { body, error: bad } = await jsonBody(request, 256 * 1024);
  if (bad) return bad;
  if (!validId(body.id) || !body.mark || typeof body.mark !== 'object') return fail(400, 'חסרים פריט או תיקון');
  try {
    const r = await fixAndApprove(body.id, body.mark, userId);
    if (!r.ok) return fail(r.status, r.error);
    return ok({ item: r.item, fixed: r.fixed });
  } catch (e) {
    return crash('fix', e);
  }
}
