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

// קריאת JSON גדול מחזיקה לזמן קצר את ה-chunks, המערך המאוחד, מחרוזת ה-UTF-8
// והאובייקט המפוענח. תקציב לפי Content-Length מגביל את סכום הגופים שנקלטים
// במקביל בכל תהליך; בקשה בלי אורך ידוע שומרת את מלוא התקציב, באופן שמרני.
export const APP_REPORT_MIN_RESERVATION_BYTES = 1024 * 1024;
export const APP_REPORT_MAX_CONCURRENT = 8;

export function createAppReportAdmission({
  maxInflightBytes = MAX_BODY_BYTES,
  minReservationBytes = APP_REPORT_MIN_RESERVATION_BYTES,
  maxConcurrent = APP_REPORT_MAX_CONCURRENT,
} = {}) {
  let inflightBytes = 0;
  let active = 0;
  return {
    acquire(request) {
      const header = request.headers.get('content-length');
      const parsed = header !== null && /^\d+$/.test(header) ? Number(header) : NaN;
      if (Number.isFinite(parsed) && parsed > MAX_BODY_BYTES) return { tooLarge: true };
      const estimated = Number.isFinite(parsed) ? parsed : MAX_BODY_BYTES;
      const reservation = Math.max(minReservationBytes, estimated);
      if (active >= maxConcurrent || inflightBytes + reservation > maxInflightBytes) return null;
      active += 1;
      inflightBytes += reservation;
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          active -= 1;
          inflightBytes -= reservation;
        },
      };
    },
  };
}

const appReportAdmission = createAppReportAdmission();

const busy = () => new Response(JSON.stringify({ error: 'Report intake is busy; retry later' }), {
  status: 503,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'retry-after': '5' },
});

/**
 * @param {Request} request
 * @param {{saveFile:Function, deleteFile:Function, connectDB?:Function, config?:object, rateLimit?:Function,
 * admission?:ReturnType<typeof createAppReportAdmission>, ingest?:Function, githubFor?:Function, fetchImpl?:Function}} deps
 */
export async function handleAppReportPost(request, deps) {
  const rateLimit = deps.rateLimit || ((req) => checkRateLimit(getClientIp(req), 'app-report', 8, 'minute'));
  if (!rateLimit(request)) return json({ error: 'Too many requests' }, 429);

  const permit = (deps.admission || appReportAdmission).acquire(request);
  if (permit?.tooLarge) return json({ error: 'Body too large' }, 413);
  if (!permit) return busy();
  try {
    let raw;
    try {
      raw = await readJsonBodyLimited(request, MAX_BODY_BYTES);
    } catch (err) {
      if (err?.code === 'BODY_TOO_LARGE') return json({ error: 'Body too large' }, 413);
      return json({ error: 'Invalid JSON body' }, 400);
    }

    try {
      await (deps.connectDB || connectDBDefault)();
      const result = await (deps.ingest || ingestAppReport)(raw, { ...deps, config: deps.config || getAppReportsConfig() });
      return json(result.body, result.status);
    } catch (error) {
      console.error('App report intake failed:', error?.message);
      return json({ error: 'Failed to save report' }, 500);
    }
  } finally {
    permit.release();
  }
}
