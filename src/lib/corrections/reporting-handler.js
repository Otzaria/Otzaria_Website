/**
 * לוגיקת POST /api/reportingerrors (חוזה A). הנתיב ציבורי בכוונה: הדיווחים מגיעים
 * מתוכנת אוצריא בלי חשבון, ולכן יש rate limit ותקרת גוף. תאימות מלאה ללקוח ישן.
 */
import connectDBDefault from '../db.js';
import { checkRateLimit } from '../rate-limit.js';
import { getClientIp } from '../client-ip.js';
import { validateIntakePayload } from './payload.js';
import { getCorrectionsConfig } from './config.js';
import { ingestReport } from './intake.js';
import { MAX_REPORT_BODY_BYTES, readJsonBodyLimited, normalizePayload, notifyReportByEmail } from './report-email.js';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * @param {Request} request
 * @param {{connectDB?:Function, config?:object, notify?:Function, rateLimit?:Function}} [deps]
 */
export async function handleReportingErrorsPost(request, deps = {}) {
  const connectDB = deps.connectDB || connectDBDefault;
  const notify = deps.notify || notifyReportByEmail;
  const rateLimit = deps.rateLimit || ((req) => checkRateLimit(getClientIp(req), 'error-report', 8, 'minute'));

  try {
    if (!rateLimit(request)) return json({ success: false, error: 'Too many requests', reportId: null }, 429);
  } catch {
    // כשל במנגנון ה-rate limit עצמו לא חוסם דיווח לגיטימי
  }

  let raw;
  try {
    raw = await readJsonBodyLimited(request, MAX_REPORT_BODY_BYTES);
  } catch (err) {
    if (err?.code === 'BODY_TOO_LARGE') return json({ success: false, error: 'body_too_large', reportId: null }, 413);
    return json({ success: false, error: 'invalid_json', reportId: null }, 400);
  }

  const config = deps.config || getCorrectionsConfig();
  if (!config.intakeEnabled) return json({ success: false, error: 'intake_disabled', reportId: null }, 503);

  const validated = validateIntakePayload(raw);
  if (!validated.ok) return json({ success: false, error: validated.error, reportId: null }, validated.status);

  const payload = normalizePayload(raw);
  let result;
  try {
    await connectDB();
    result = await ingestReport({ legacy: payload, validated, config });
  } catch (error) {
    console.error('Reporting errors API: save failed:', error?.message);
    return json({ success: false, error: 'save_failed', reportId: payload.report_id, savedToDatabase: false }, 500);
  }

  if (result.outcome === 'conflict') {
    return json({ success: false, error: 'report_id_conflict', reportId: payload.report_id }, 409);
  }

  let email = { emailSent: false, duplicate: false };
  if (result.outcome === 'replay' && result.report.emailSent) {
    email = { emailSent: false, duplicate: true };
  } else {
    email = await notify(payload);
  }

  return json({
    success: true,
    accepted: true,
    reportId: payload.report_id,
    savedToDatabase: true,
    correction_supported: true,
    email_sent: Boolean(email.emailSent),
    duplicate: Boolean(email.duplicate),
    ...(result.outcome === 'replay' ? { idempotent_replay: true } : {}),
    message: 'הדיווח נקלט',
  });
}
