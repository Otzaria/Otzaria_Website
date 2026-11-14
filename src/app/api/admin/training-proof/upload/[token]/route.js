import { adminGate, ok, fail, crash } from '../../_lib/http';
import { step, cancel } from '../../_lib/ingest';

export const maxDuration = 60;

// POST ← {done, total, inserted, skipped, finished} — מנה אחת של הקליטה (עד 300 פריטים או
// כ-8 שניות). הדפדפן קורא שוב עד finished. 409 — הקליטה לא נמצאה (הסתיימה/בוטלה/ננטשה).
export async function POST(_request, { params }) {
  const { error } = await adminGate();
  if (error) return error;
  try {
    const { token } = await params;
    const r = await step(token);
    if (r.error) return fail(409, r.error);
    return ok(r);
  } catch (e) {
    return crash('upload step', e, 'הקליטה נעצרה — אפשר להמשיך מאותה נקודה');
  }
}

// DELETE — ביטול קליטה באמצע. מה שכבר נקלט נשאר
export async function DELETE(_request, { params }) {
  const { error } = await adminGate();
  if (error) return error;
  try {
    const { token } = await params;
    return ok({ cancelled: await cancel(token) });
  } catch (e) {
    return crash('upload cancel', e);
  }
}
