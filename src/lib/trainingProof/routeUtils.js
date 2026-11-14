import { NextResponse } from 'next/server';

// עזרים קטנים לנתיבי /api/training-proof (זיהוי ונתב): תשובה פרטית בלי מטמון (הנתון תלוי
// במתנדב), קריאת section מהגוף או מהכתובת, וגוף JSON עם תקרת-גודל.

export const NO_STORE = { 'Cache-Control': 'private, no-store' };

export const ok = (data, status = 200) => NextResponse.json({ success: true, ...data }, { status, headers: NO_STORE });

export const fail = (status, error) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

// החלקים שיש להם סבב של 30 (frames — לפי ספר, בנתיבים של הגלאי)
export const ROUND_SECTIONS = ['ocr', 'router'];

const MAX_BODY = 64 * 1024;

// גוף קטן (סימון, דופק) כ-JSON. sendBeacon שולח text/plain — לכן קוראים את הטקסט ולא
// סומכים על Content-Type. גוף שאינו JSON = {} (הבדיקה של השדות תדחה אותו).
export async function smallBody(request) {
  const len = Number(request?.headers?.get?.('content-length'));
  if (Number.isFinite(len) && len > MAX_BODY) return { error: fail(413, 'הבקשה גדולה מדי') };
  const raw = typeof request?.text === 'function' ? await request.text().catch(() => '') : '';
  if (raw.length > MAX_BODY) return { error: fail(413, 'הבקשה גדולה מדי') };
  try {
    const body = raw ? JSON.parse(raw) : {};
    return { body: body && typeof body === 'object' ? body : {} };
  } catch {
    return { body: {} };
  }
}
