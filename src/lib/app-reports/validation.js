/**
 * אימות ונרמול של דיווח מהתוכנה (חוזה app-reports, schema 1).
 * שגיאה מחזירה 422 עם שם השדה — הלקוח מתייחס לזה כדחייה סופית.
 */
import { validateEmail } from '../validation-utils.js';

export const MAX_DIAGNOSTICS_BYTES = 300 * 1024;
export const MAX_ERROR_LOG_BYTES = 250 * 1024;

// צילומי מסך: base64 בתוך ה-JSON, ולכן תקרת הגוף כוללת את הקידוד שלהם (4/3).
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_TOTAL_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_NAME_CHARS = 200;
const MAX_TEXT_BODY_BYTES = 700 * 1024;
export const MAX_BODY_BYTES = MAX_TEXT_BODY_BYTES + Math.ceil(MAX_IMAGES_TOTAL_BYTES / 3) * 4 + 64 * 1024;

export const IMAGE_TYPES = Object.freeze({
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
});

export const REPORT_TYPES = Object.freeze(['bug', 'crash', 'performance', 'suggestion']);
export const TRIGGERS = Object.freeze(['manual', 'crash_prompt', 'auto_crash']);
export const PLATFORMS = Object.freeze(['windows', 'linux', 'macos', 'android', 'ios', 'other']);

const REPORT_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const ISO_UTC_FRACTION_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,9}Z$/;

const fail = (field, error = 'invalid') => ({ ok: false, status: 422, field, error: `${field}: ${error}` });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const byteLength = (s) => Buffer.byteLength(s, 'utf8');

/** סוג התמונה לפי הבתים עצמם — לא סומכים על mimeType שהלקוח הצהיר. */
export function sniffImageType(buffer) {
  for (const [mimeType, { magic }] of Object.entries(IMAGE_TYPES)) {
    if (buffer.length >= magic.length && magic.every((b, i) => buffer[i] === b)) return mimeType;
  }
  return null;
}

// שם הקובץ מוצג למנהל ומשמש בכותרת ההורדה: בלי נתיב, תווי בקרה ומרכאות.
function cleanImageName(raw, index, ext) {
  const base = typeof raw === 'string'
    ? raw.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, MAX_IMAGE_NAME_CHARS)
    : '';
  return base || `image-${index + 1}.${ext}`;
}

function validateImages(raw) {
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { error: fail('attachments.images', 'must be an array') };
  if (raw.length > MAX_IMAGES) return { error: fail('attachments.images', `max ${MAX_IMAGES} items`) };
  const images = [];
  let total = 0;
  for (const [i, item] of raw.entries()) {
    const field = `attachments.images[${i}]`;
    if (!isPlainObject(item) || typeof item.data !== 'string') return { error: fail(field, 'data must be a base64 string') };
    const buffer = Buffer.from(item.data, 'base64');
    // Buffer.from מדלג בשקט על תווים לא חוקיים; השוואה חוזרת תופסת קלט פגום.
    if (buffer.toString('base64') !== item.data) return { error: fail(field, 'invalid base64') };
    if (buffer.length > MAX_IMAGE_BYTES) return { error: fail(field, 'too large') };
    const mimeType = sniffImageType(buffer);
    if (!mimeType) return { error: fail(field, 'not a PNG/JPEG image') };
    total += buffer.length;
    if (total > MAX_IMAGES_TOTAL_BYTES) return { error: fail('attachments.images', 'total too large') };
    images.push({ buffer, mimeType, fileName: cleanImageName(item.fileName, i, IMAGE_TYPES[mimeType].ext) });
  }
  return { value: images };
}

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
  let images = [];
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
    const imgs = validateImages(raw.attachments.images);
    if (imgs.error) return imgs.error;
    images = imgs.value;
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
      images,
    },
  };
}
