/**
 * POST /api/app-reports — ציבורי (התוכנה שולחת בלי חשבון): rate limit, תקרת גוף, קליטה.
 */
import connectDBDefault from '../db.js';
import { checkRateLimit } from '../rate-limit.js';
import { getClientIp } from '../client-ip.js';
import { readJsonBodyLimited } from '../corrections/report-email.js';
import { MAX_BODY_BYTES } from './validation.js';
import { getAppReportsConfig } from './config.js';
import { ingestAppReport } from './service.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * @param {Request} request
 * @param {{saveFile:Function, connectDB?:Function, config?:object, rateLimit?:Function, github?:object, fetchImpl?:Function}} deps
 */
export async function handleAppReportPost(request, deps) {
  const rateLimit = deps.rateLimit || ((req) => checkRateLimit(getClientIp(req), 'app-report', 8, 'minute'));
  if (!rateLimit(request)) return json({ error: 'Too many requests' }, 429);

  let raw;
  try {
    raw = await readJsonBodyLimited(request, MAX_BODY_BYTES);
  } catch (err) {
    if (err?.code === 'BODY_TOO_LARGE') return json({ error: 'Body too large' }, 413);
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    await (deps.connectDB || connectDBDefault)();
    const result = await ingestAppReport(raw, { ...deps, config: deps.config || getAppReportsConfig() });
    return json(result.body, result.status);
  } catch (error) {
    console.error('App report intake failed:', error?.message);
    return json({ error: 'Failed to save report' }, 500);
  }
}
