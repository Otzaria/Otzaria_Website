import { NextResponse } from 'next/server';
import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { BOOK_RE } from '@/lib/trainingProof/vocab';

// עזר משותף לנתיבי /api/training-proof/frames/*: שער-הגישה, תשובות private/no-store, וקריאת JSON עם תקרה.

const NO_STORE = 'private, no-store';
export const MAX_BODY = 256 * 1024;

export function json(body, status = 200) {
  const res = NextResponse.json(body, { status });
  res.headers.set('Cache-Control', NO_STORE);
  return res;
}

// תוצאה של framesDb ({ok, …} / {ok:false, status, error}) → תשובה
export function fromResult(r) {
  if (!r.ok) return json({ success: false, error: r.error }, r.status || 409);
  const { ok: _ok, ...rest } = r;
  return json({ success: true, ...rest });
}

// השער — מחזיר {gate} או {res} (תשובת 401/403 מוכנה)
export async function gate() {
  const g = await requireTrainingProofSession();
  if (g.error) {
    g.error.headers.set('Cache-Control', NO_STORE);
    return { res: g.error };
  }
  return { gate: g };
}

export const bookParam = (raw) => (BOOK_RE.test(String(raw || '')) ? String(raw) : null);

export async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { tooBig: true };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { body: null };
  }
}

export function serverError(label, e) {
  console.error(`training-proof frames ${label}`, e);
  return json({ success: false, error: 'שגיאת שרת' }, 500);
}
