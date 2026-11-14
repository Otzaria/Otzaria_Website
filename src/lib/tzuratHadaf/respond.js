import { NextResponse } from 'next/server';
import { readJsonBody as readJsonBodyStream } from './requestBody.js';

// צורת הדף — תגובות HTTP של הראוטים (/api/tzurat-hadaf/**, /api/admin/tzurat-hadaf/**). הכול תלוי-בצופה או ניהולי —
// private, no-store (חוץ מתמונות). שגיאה: {error: "<עברית>", code?} (CONTRACT.md "צורות התגובה").

export const NO_STORE = 'private, no-store';
export const IMAGE_CACHE = 'private, max-age=86400, immutable';
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export function noStore(res) {
  res.headers.set('Cache-Control', NO_STORE);
  return res;
}

export const json = (body, status = 200) => noStore(NextResponse.json(body, { status }));

export const errorJson = (status, error, code) => json({ error, ...(code ? { code } : {}) }, status);

// תוצאה של מודולי השרת ({ok, ...שדות} או {ok:false, status, error, code}) ← תגובה
export function fromResult(result, status = 200) {
  if (result?.ok) {
    const { ok: _ok, ...rest } = result;
    return json(rest, status);
  }
  return errorJson(result?.status || 409, result?.error || 'הפעולה נכשלה', result?.code);
}

export const serverError = () => errorJson(500, 'אירעה שגיאה, נסו שוב מאוחר יותר');
export const badRequest = (error) => errorJson(400, error);
export const notFound = (error = 'לא נמצא') => errorJson(404, error);

// גוף JSON עם תקרת-גודל: {body} (null אם אינו JSON) או {tooBig:true}
export async function readJsonBody(request, max = MAX_BODY_BYTES) {
  return readJsonBodyStream(request, max);
}

export const tooBigResponse = () => errorJson(413, 'הבקשה גדולה מדי');

export function imageResponse({ buffer, type }) {
  return new NextResponse(buffer, {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': IMAGE_CACHE, 'Content-Length': String(buffer.length) },
  });
}
