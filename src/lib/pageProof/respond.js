import { NextResponse } from 'next/server';
import { decodeParam } from './gridState.js';

// תגובות HTTP של ראוטי בחירת-העמודים (/api/page-proof/books/**,
// /api/page-proof/pages/[id]/claim). הכול תלוי-בצופה — אסור שייכנס למטמון
// משותף, גם לא תגובת שגיאה.

export const NO_STORE = 'private, no-store';

export function noStore(res) {
  res.headers.set('Cache-Control', NO_STORE);
  return res;
}

export const json = (body, status = 200) => noStore(NextResponse.json(body, { status }));

const MAX_GID = 200;

// מזהה-הספר מהכתובת ← מחרוזת, או null אם ריק או ארוך מדי
export function gidParam(raw) {
  const gid = decodeParam(raw);
  return gid.length > 0 && gid.length <= MAX_GID ? gid : null;
}

// תוצאה של claims.js ({ok, status, error, ...שדות}) ← תגובה
export function fromResult(result) {
  if (result?.ok) {
    const { ok: _ok, status: _status, ...rest } = result;
    return json({ success: true, ...rest });
  }
  return json({ success: false, error: result?.error || 'הפעולה נכשלה' }, result?.status || 409);
}
