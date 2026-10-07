/**
 * POST /api/app-reports/inbound-email — תשובות המדווחים, מה-Email Worker של Cloudflare
 * (workers/app-reports-inbound). האימות: Bearer APP_REPORTS_INBOUND_SECRET.
 * חוזה הסטטוסים מול ה-Worker: 2xx = נקלט/כפול/מענה אוטומטי; 404/413/422 = קבוע (המייל מועבר לתיבה רגילה);
 * כל השאר (כולל 503 של חסימת השבת ב-proxy) = זמני, וה-Worker ינסה שוב.
 */
import { timingSafeEqual } from 'node:crypto';
import connectDBDefault from '../db.js';
import { readJsonBodyLimited } from '../corrections/report-email.js';
import { getAppReportsConfig } from './config.js';
import { ingestInboundReply } from './service.js';

export const MAX_INBOUND_BODY_BYTES = 2 * 1024 * 1024;

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

function bearerMatches(request, secret) {
  const header = request.headers.get('authorization') || '';
  const a = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * @param {Request} request
 * @param {{config?:object, connectDB?:Function, github?:object, fetchImpl?:Function, now?:Date}} deps
 */
export async function handleInboundEmailPost(request, deps = {}) {
  const config = deps.config || getAppReportsConfig();
  if (!config.inboundSecret) return json({ error: 'Inbound email not configured' }, 503);
  if (!bearerMatches(request, config.inboundSecret)) return json({ error: 'Unauthorized' }, 401);

  let raw;
  try {
    raw = await readJsonBodyLimited(request, MAX_INBOUND_BODY_BYTES);
  } catch (err) {
    if (err?.code === 'BODY_TOO_LARGE') return json({ error: 'Body too large' }, 413);
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    await (deps.connectDB || connectDBDefault)();
    const result = await ingestInboundReply(raw, { ...deps, config });
    return json(result.body, result.status);
  } catch (error) {
    console.error('Inbound app-report reply failed:', error?.message);
    return json({ error: 'Failed to store reply' }, 500);
  }
}
