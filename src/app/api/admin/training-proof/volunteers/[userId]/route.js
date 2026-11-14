import { adminGate, ok, fail, jsonBody, validId, crash } from '../../_lib/http';
import { decide } from '../../_lib/volunteers';

// POST {action:'approve'|'deny'|'revoke'} ← {status, released}
// אישור בקשה, דחייה, או ביטול גישה (עם החזרת השורות והספר שהמתנדב תפס למאגר).
export async function POST(request, { params }) {
  const { userId: me, error } = await adminGate();
  if (error) return error;
  const { userId } = await params;
  if (!validId(userId)) return fail(400, 'מזהה לא תקין');
  const { body, error: bad } = await jsonBody(request);
  if (bad) return bad;
  try {
    const r = await decide(userId, body.action, me);
    if (r.error) return fail(r.status, r.error);
    return ok(r);
  } catch (e) {
    return crash('volunteer decide', e);
  }
}
