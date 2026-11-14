import { adminGate, ok, fail, jsonBody, crash } from '../_lib/http';
import { listVolunteers, addDirect } from '../_lib/volunteers';

// GET  ← {requests:[…], approved:[{…, stats:{lines, pages, pending, approved, rejected, match}}], others:[…]}
// POST {query: אימייל או שם} ← {userId, name, email} — הוספה ישירה של משתמש רשום (ה-17)
export async function GET() {
  const { error } = await adminGate();
  if (error) return error;
  try {
    return ok(await listVolunteers());
  } catch (e) {
    return crash('volunteers', e);
  }
}

export async function POST(request) {
  const { userId, error } = await adminGate();
  if (error) return error;
  const { body, error: bad } = await jsonBody(request);
  if (bad) return bad;
  try {
    const r = await addDirect(body.query, userId);
    if (r.error) return fail(r.status, r.error);
    return ok(r);
  } catch (e) {
    return crash('volunteers add', e);
  }
}
