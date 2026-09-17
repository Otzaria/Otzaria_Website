/**
 * אימות ונרמול של דיווח מהתוכנה (חוזה app-reports, schema 1).
 * שגיאה מחזירה 422 עם שם השדה — הלקוח מתייחס לזה כדחייה סופית.
 */
import { validateEmail } from '../validation-utils.js';

export const MAX_BODY_BYTES = 700 * 1024;
export const MAX_DIAGNOSTICS_BYTES = 300 * 1024;
export const MAX_ERROR_LOG_BYTES = 250 * 1024;

export const REPORT_TYPES = Object.freeze(['bug', 'crash', 'performance', 'suggestion']);
export const TRIGGERS = Object.freeze(['manual', 'crash_prompt', 'auto_crash']);
export const PLATFORMS = Object.freeze(['windows', 'linux', 'macos', 'android', 'ios', 'other']);

const REPORT_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ISO_UTC_FRACTION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z$/;

const fail = (field, error = 'invalid') => ({ ok: false, status: 422, field, error: `${field}: ${error}` });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const byteLength = (s) => Buffer.byteLength(s, 'utf8');

function optionalString(raw, field, max) {
  const v = raw[field];
  if (v === undefined || v === null) return { value: '' };
  if (typeof v !== 'string') return { error: fail(field, 'must be a string') };
  const trimmed = v.trim();
  if (trimmed.length > max) return { error: fail(field, `max ${max} chars`) };
  return { value: trimmed };
}

/**
 * @param {unknown} raw גוף הבקשה אחרי JSON.parse
 * @returns {{ok:true, value:object} | {ok:false, status:number, field:string, error:string}}
 */
export function validateAppReport(raw) {
  if (!isPlainObject(raw)) return fail('body', 'must be an object');
  if (raw.schema !== 1) return fail('schema', 'unsupported');

  if (typeof raw.reportId !== 'string' || !REPORT_ID_RE.test(raw.reportId.trim())) return fail('reportId');
  const reportId = raw.reportId.trim();

  if (!REPORT_TYPES.includes(raw.type)) return fail('type', 'unknown');
  if (!TRIGGERS.includes(raw.trigger)) return fail('trigger', 'unknown');
  const manual = raw.trigger === 'manual';

  const strings = {};
  for (const [field, max] of [['title', 200], ['description', 10000], ['stepsToReproduce', 5000], ['appVersion', 50], ['osVersion', 200], ['arch', 20], ['sentryEventId', 64]]) {
    const r = optionalString(raw, field, max);
    if (r.error) return r.error;
    strings[field] = r.value;
  }
  if (!strings.title) return fail('title', 'required');
  if (!strings.appVersion) return fail('appVersion', 'required');
  if (manual && !strings.description) return fail('description', 'required for manual reports');

  if (!PLATFORMS.includes(raw.platform)) return fail('platform', 'unknown');

  const emailRaw = optionalString(raw, 'reporterEmail', 254);
  if (emailRaw.error) return emailRaw.error;
  const reporterEmail = emailRaw.value.toLowerCase();
  if (reporterEmail && !validateEmail(reporterEmail).isValid) return fail('reporterEmail', 'invalid');
  if (manual && !reporterEmail) return fail('reporterEmail', 'required for manual reports');

  let signature = null;
  if (raw.signature !== undefined && raw.signature !== null) {
    if (!isPlainObject(raw.signature)) return fail('signature', 'must be an object');
    const ex = optionalString(raw.signature, 'exceptionType', 200);
    if (ex.error) return fail('signature.exceptionType', 'invalid');
    const frames = raw.signature.frames ?? [];
    if (!Array.isArray(frames) || frames.length > 3) return fail('signature.frames', 'max 3 items');
    const cleanFrames = [];
    for (const f of frames) {
      if (typeof f !== 'string' || f.length > 300) return fail('signature.frames', 'items must be strings ≤300');
      cleanFrames.push(f.trim());
    }
    signature = { exceptionType: ex.value, frames: cleanFrames };
  }

  let clientCreatedAt = null;
  if (raw.createdAt !== undefined && raw.createdAt !== null) {
    if (typeof raw.createdAt !== 'string' || !(ISO_UTC_RE.test(raw.createdAt) || ISO_UTC_FRACTION_RE.test(raw.createdAt)) || Number.isNaN(Date.parse(raw.createdAt))) {
      return fail('createdAt', 'must be UTC ISO-8601 with Z');
    }
    clientCreatedAt = new Date(raw.createdAt);
  }

  let diagnostics = null;
  let errorLog = '';
  if (raw.attachments !== undefined && raw.attachments !== null) {
    if (!isPlainObject(raw.attachments)) return fail('attachments', 'must be an object');
    const d = raw.attachments.diagnostics;
    if (d !== undefined && d !== null) {
      if (!isPlainObject(d)) return fail('attachments.diagnostics', 'must be an object');
      if (byteLength(JSON.stringify(d)) > MAX_DIAGNOSTICS_BYTES) return fail('attachments.diagnostics', 'too large');
      diagnostics = d;
    }
    const log = raw.attachments.errorLog;
    if (log !== undefined && log !== null) {
      if (typeof log !== 'string') return fail('attachments.errorLog', 'must be a string');
      if (byteLength(log) > MAX_ERROR_LOG_BYTES) return fail('attachments.errorLog', 'too large');
      errorLog = log;
    }
  }

  return {
    ok: true,
    value: {
      schema: 1,
      reportId,
      type: raw.type,
      trigger: raw.trigger,
      ...strings,
      reporterEmail,
      platform: raw.platform,
      signature,
      clientCreatedAt,
      diagnostics,
      errorLog,
    },
  };
}
