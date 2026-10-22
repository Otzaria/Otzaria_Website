// תגובות HTTP ועטיפת אימות לראוטי /api/worker/v1. כל תגובה (גם שגיאה) היא JSON עם no-store,
// בלי redirects — הלקוח מפרש HTML/3xx כבעיית אימות.
import connectDB from '@/lib/db';
import OcrWorkerState from '@/models/OcrWorkerState';
import { authenticateWorker } from './workerAuth';

export function workerJson(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export function workerError(status, code, extra = {}, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (status === 401) headers['WWW-Authenticate'] = 'Bearer realm="otzaria-worker"';
  return workerJson(status, { ...extra, error: code }, headers);
}

export const isJobIdParam = (id) => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id);

// גוף JSON קטן (בקרה, למשל דיווח מצב) עם תקרת גודל: Content-Length גדול מהתקרה נדחה בלי
// לקרוא את הגוף; גוף בלי Content-Length נקרא בחתיכות ונעצר בחציית התקרה. מחזיר { ok:true, body } או
// { ok:false, status, error } — 413 payload_too_large, 400 bad_request (לא UTF-8/JSON).
export async function readJsonBody(request, maxBytes) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: 'payload_too_large' };
  }
  // קריאה בחתיכות: בחציית התקרה מבטלים את הזרם בלי לטעון את שאר הגוף לזיכרון.
  const chunks = [];
  let total = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: 'payload_too_large' };
      }
      chunks.push(value);
    }
  }
  const buf = Buffer.concat(chunks);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'bad_request' };
  }
}

// handler(request, { workerId, params }) — חריגה מחזירה 500 internal_error בלי טקסט החריגה.
// הלוג מינימלי בכוונה: רק name/code של החריגה ושם הנתיב — לא message/stack (עלולים להכיל
// נתיבי קבצים, תוכן בקשה או סודות).
export function withWorker(handler) {
  return async (request, routeCtx) => {
    let route = '?';
    try {
      route = new URL(request.url).pathname;
    } catch {
      // URL לא תקין — נשאר '?'
    }
    try {
      const auth = authenticateWorker(request);
      if (!auth.ok) {
        console.warn(`[ocr-worker] auth rejected: ${auth.code}`);
        return workerError(auth.status, auth.code);
      }
      await connectDB();
      // lastSeenAt הוא לתצוגה בלבד (ראו OcrWorkerState) — כשל בעדכונו לא מפיל את הבקשה.
      try {
        await OcrWorkerState.updateOne(
          { workerId: auth.workerId },
          { $max: { lastSeenAt: new Date() }, $set: { lastRoute: `${request.method} ${route}` } },
          { upsert: true }
        );
      } catch {
        console.warn('[ocr-worker] lastSeenAt update failed');
      }
      const params = routeCtx?.params ? await routeCtx.params : {};
      return await handler(request, { workerId: auth.workerId, params });
    } catch (err) {
      console.error(
        `[ocr-worker] internal error route=${route} name=${String(err?.name ?? 'unknown')} code=${String(err?.code ?? '-')}`
      );
      return workerError(500, 'internal_error');
    }
  };
}
