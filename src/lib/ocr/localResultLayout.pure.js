// נתוני פריסה (layout v1), אזהרות ונתוני עזר (metadata) בתוצאה מהעובד המקומי — מודול טהור.
// מפרט: docs/ocr-local-worker/CONTRACT.md, סעיף "נתוני פריסה, אזהרות ונתוני עזר".
//
// עיקרון מחייב: שום בעיה ב-layout / warnings / metadata לא דוחה את התוצאה. הוולידטור
// (localResultValidate.js) לא בודק את השדות האלה כלל; כאן הם מנורמלים לכל עמוד בנפרד, ובעיה
// גורמת רק להשמטת ה-layout (או ה-metadata) של אותו עמוד, עם אזהרה שנשמרת ברשומת העמוד
// (OcrPageResult). הטקסט נקלט תמיד כרגיל.
//
// הפונקציות דטרמיניסטיות: השלמת קליטה מהקובץ השמור (resumeStalledApply) חייבת לתת בדיוק אותה
// רשומה כמו הקליטה המקורית. הודעות השגיאה כאן באנגלית — לאבחון בלבד; התווית בעברית נקבעת לפי
// הקוד (ocrWarningLabels.js). imports יחסיים בלבד (נבדק ב-node:test).
import { createHash } from 'node:crypto';
import { stripUnsafe } from './localStatusReport.js';

export const LAYOUT_VERSION = 1;
export const SITE_LAYOUT_PAGE_MAX_BYTES = 1_179_648; // 1.125MiB (UTF-8 של JSON.stringify)
export const PAGE_METADATA_MAX_BYTES = 65_536;
export const BOOK_METADATA_MAX_BYTES = 524_288;
export const MAX_PAGE_WARNINGS = 20;
export const WARNING_MESSAGE_MAX_CHARS = 500;
export const MAX_LAYOUT_ERRORS = 5;
export const MAX_LAYOUT_DEPTH = 8;

export const LAYOUT_STATUSES = Object.freeze(['ok', 'absent', 'invalid', 'unsupported_version', 'too_large']);
export const WARNING_CODE_RE = /^[a-z0-9_]{1,64}$/;

// תת-הקבוצה של metadata הספר שנשמרת כשהמסמך המלא גדול מ-BOOK_METADATA_MAX_BYTES
export const BOOK_METADATA_SUBSET_KEYS = Object.freeze([
  'hardware', 'models', 'gpu', 'seconds', 'run_seconds', 'resumed', 'bridge_version', 'service_version',
  'otzaria_issues', 'layout', 'salvage',
]);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const utf8Bytes = (s) => Buffer.byteLength(s, 'utf8');
const SHA_RE = /^[0-9a-f]{64}$/;

const clip = (s) => stripUnsafe(String(s ?? ''), WARNING_MESSAGE_MAX_CHARS).trim();
const siteWarning = (code, message) => ({ code, message: clip(message), source: 'site' });

/** UTF-8 → sha256 hex */
export function textSha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/**
 * warnings מהעובד → [{code, message, source:'worker'}]. מתעלם מכל מה שאינו תקין (לא מערך, פריט
 * שאינו אובייקט, קוד שאינו ^[a-z0-9_]{1,64}$); message מנוקה ומקוצר ל-500; עד 20 פריטים.
 */
export function normalizeWarnings(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const w of raw) {
    if (out.length >= MAX_PAGE_WARNINGS) break;
    if (!isPlainObject(w) || typeof w.code !== 'string' || !WARNING_CODE_RE.test(w.code)) continue;
    out.push({ code: w.code, message: typeof w.message === 'string' ? clip(w.message) : '', source: 'worker' });
  }
  return out;
}

// JSON.stringify שלא זורק: קינון עמוק מאוד (אלפי רמות — עובר את JSON.parse ואת validateResult)
// זורק RangeError, וחריגה כאן הייתה מפילה את כל הקליטה (500 בכל ניסיון — הטקסט לא נקלט לעולם).
const safeStringify = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
};

/** pages[].metadata → {json, warning}: JSON כמות שהוא, או null + metadata_too_large מעל 64KiB */
export function pageMetadataJson(raw) {
  if (!isPlainObject(raw)) return { json: null, warning: null };
  const json = safeStringify(raw);
  if (json === null) {
    return {
      json: null,
      warning: siteWarning('metadata_too_large', 'page metadata could not be serialized (nesting too deep); not stored'),
    };
  }
  const bytes = utf8Bytes(json);
  if (bytes > PAGE_METADATA_MAX_BYTES) {
    return {
      json: null,
      warning: siteWarning('metadata_too_large', `page metadata is ${bytes} bytes, above ${PAGE_METADATA_MAX_BYTES}; not stored`),
    };
  }
  return { json, warning: null };
}

/** metadata הספר → {json, truncated}: המלא, או תת-קבוצה קבועה כשהמלא גדול מ-512KiB */
export function bookMetadataJson(raw) {
  if (!isPlainObject(raw)) return { json: null, truncated: false };
  const full = safeStringify(raw);
  if (full !== null && utf8Bytes(full) <= BOOK_METADATA_MAX_BYTES) return { json: full, truncated: false };
  const subset = {};
  for (const k of BOOK_METADATA_SUBSET_KEYS) if (Object.hasOwn(raw, k)) subset[k] = raw[k];
  const json = safeStringify(subset);
  return { json: json !== null && utf8Bytes(json) <= BOOK_METADATA_MAX_BYTES ? json : null, truncated: true };
}

// ---------- אימות layout v1 ----------

// מפתחות אסורים ועומק קינון (כללי התאימות של v1): '$' בהתחלה, '.', '\0', ועומק > 8.
// עוצר בעומק 9 — קלט מקונן מאוד לא גורם לרקורסיה עמוקה.
function keyProblem(value, depth) {
  if (value === null || typeof value !== 'object') return null;
  if (depth > MAX_LAYOUT_DEPTH) return `nesting deeper than ${MAX_LAYOUT_DEPTH}`;
  if (Array.isArray(value)) {
    for (const v of value) {
      const p = keyProblem(v, depth + 1);
      if (p) return p;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith('$') || k.includes('.') || k.includes('\u0000')) return `forbidden key ${JSON.stringify(k.slice(0, 40))}`;
    const p = keyProblem(v, depth + 1);
    if (p) return p;
  }
  return null;
}

const isInt = (v) => Number.isSafeInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isIntIn = (v, lo, hi) => isInt(v) && v >= lo && v <= hi;
const isNumIn = (v, lo, hi) => isNum(v) && v >= lo && v <= hi;
const isStr = (v) => typeof v === 'string';
const isStrArray = (v) => Array.isArray(v) && v.every(isStr);
const isBox = (v) => Array.isArray(v) && v.length === 4 && v.every(isInt) && v[0] <= v[2] && v[1] <= v[3];
// שדה אופציונלי: חסר או null נחשבים "אין ערך" (החוזה אומר "מושמט", ו-null לא נדחה בגללו)
const absent = (v) => v === undefined || v === null;

const SCRIPTS = new Set(['square', 'rashi', 'latin', 'mixed']);
const FURNITURE = new Set(['page_number', 'running_head']);
const FRAME_KINDS = new Set(['text', 'object']);
const FRAME_STREAMS = new Set(['header', 'footer']);

const MAX_LINES = 5000;
const MAX_FRAMES = 1000;
const MAX_ORDER_FRAMES = 2000;
const MAX_WORDS = 2000;
const MAX_LINE_TEXT = 10000;
const MAX_ALTERNATIVES = 50;
const MAX_CANDIDATES = 50;
const MAX_LM = 20;
const MAX_FID = 16;

function isWord(w) {
  return Array.isArray(w) && w.length >= 3 && isInt(w[0]) && isInt(w[1]) && (w[2] === null || isNumIn(w[2], 0, 1));
}

function lineProblems(line, i, push) {
  const at = `lines[${i}]`;
  if (!isPlainObject(line)) return push(`${at} is not an object`);
  if (!isIntIn(line.k, 0, Number.MAX_SAFE_INTEGER)) push(`${at}.k invalid`);
  if (!(line.order === null || isIntIn(line.order, 1, Number.MAX_SAFE_INTEGER))) push(`${at}.order invalid`);
  if (typeof line.inText !== 'boolean') push(`${at}.inText invalid`);
  if (!isStr(line.text) || line.text.length > MAX_LINE_TEXT) push(`${at}.text invalid`);
  if (!absent(line.corrected) && !isStr(line.corrected)) push(`${at}.corrected invalid`);
  if (!isBox(line.bbox)) push(`${at}.bbox invalid`);
  if (!(line.conf === null || isNumIn(line.conf, 0, 100))) push(`${at}.conf invalid`);
  if (!(line.script === null || SCRIPTS.has(line.script))) push(`${at}.script invalid`);
  if (!isStr(line.stream)) push(`${at}.stream invalid`);
  if (!absent(line.streamSrc) && !isStr(line.streamSrc)) push(`${at}.streamSrc invalid`);
  if (!absent(line.streamConf) && !isNum(line.streamConf)) push(`${at}.streamConf invalid`);
  if (!absent(line.streamAlt) && !isPlainObject(line.streamAlt)) push(`${at}.streamAlt invalid`);
  if (!absent(line.furniture) && !FURNITURE.has(line.furniture)) push(`${at}.furniture invalid`);
  if (!(line.fid === null || isStr(line.fid))) push(`${at}.fid invalid`);
  if (!(line.frameRole === null || isStr(line.frameRole))) push(`${at}.frameRole invalid`);
  if (!isStr(line.status)) push(`${at}.status invalid`);
  if (!absent(line.suspect) && !isStrArray(line.suspect)) push(`${at}.suspect invalid`);
  const words = line.words;
  const wordsOk = words === null || (Array.isArray(words) && words.length <= MAX_WORDS && words.every(isWord));
  if (!wordsOk) push(`${at}.words invalid`);
  const nWords = Array.isArray(words) ? words.length : 0;
  if (!absent(line.wordScript) && !(isStrArray(line.wordScript) && line.wordScript.length === nWords)) {
    push(`${at}.wordScript invalid`);
  }
  if (!absent(line.wordTexts) && !(isStrArray(line.wordTexts) && line.wordTexts.length === nWords)) {
    push(`${at}.wordTexts invalid`);
  }
  if (!absent(line.alternatives)
    && !(Array.isArray(line.alternatives) && line.alternatives.length <= MAX_ALTERNATIVES && line.alternatives.every(isPlainObject))) {
    push(`${at}.alternatives invalid`);
  }
  if (!absent(line.candidates)
    && !(Array.isArray(line.candidates) && line.candidates.length <= MAX_CANDIDATES && line.candidates.every(Array.isArray))) {
    push(`${at}.candidates invalid`);
  }
  if (!absent(line.lm) && !(Array.isArray(line.lm) && line.lm.length <= MAX_LM && line.lm.every(isPlainObject))) {
    push(`${at}.lm invalid`);
  }
  return undefined;
}

function frameProblems(frame, i, push) {
  const at = `frames[${i}]`;
  if (!isPlainObject(frame)) return push(`${at} is not an object`);
  if (!isStr(frame.fid) || frame.fid.length > MAX_FID) push(`${at}.fid invalid`);
  if (!isBox(frame.bbox)) push(`${at}.bbox invalid`);
  if (!isStr(frame.role)) push(`${at}.role invalid`);
  if (!FRAME_KINDS.has(frame.kind)) push(`${at}.kind invalid`);
  if (!(frame.conf === null || isNumIn(frame.conf, 0, 1))) push(`${at}.conf invalid`);
  if (!(frame.order === null || isIntIn(frame.order, 1, Number.MAX_SAFE_INTEGER))) push(`${at}.order invalid`);
  if (!absent(frame.stream) && !FRAME_STREAMS.has(frame.stream)) push(`${at}.stream invalid`);
  if (!absent(frame.alt) && !isPlainObject(frame.alt)) push(`${at}.alt invalid`);
  return undefined;
}

/** בעיות מול סכמת layout v1 (CONTRACT.md / חוזה A.3) — עד MAX_LAYOUT_ERRORS, באנגלית */
export function layoutV1Problems(layout) {
  const errors = [];
  // אחרי MAX_LAYOUT_ERRORS מפסיקים לאסוף (ולא ממשיכים לסרוק אלפי שורות פגומות)
  const push = (e) => { if (errors.length < MAX_LAYOUT_ERRORS) errors.push(e); };
  const full = () => errors.length >= MAX_LAYOUT_ERRORS;

  if (!isIntIn(layout.pipelineSchema, 1, Number.MAX_SAFE_INTEGER)) push('pipelineSchema invalid');
  if (layout.coordSpace !== 'aligned') push('coordSpace must be "aligned"');
  const m = layout.toSource;
  if (!(Array.isArray(m) && m.length === 6 && m.every(isNum))) push('toSource invalid');
  else {
    const det = Math.abs(m[0] * m[4] - m[1] * m[3]);
    if (!(det >= 0.25 && det <= 4)) push('toSource determinant out of range');
  }
  if (!isNumIn(layout.rotationDeg, -45, 45)) push('rotationDeg invalid');
  const img = layout.image;
  if (!isPlainObject(img)) push('image invalid');
  else {
    if (!isIntIn(img.width, 1, 100000) || !isIntIn(img.height, 1, 100000)) push('image size invalid');
    if (!isStr(img.imageSha256) || !SHA_RE.test(img.imageSha256)) push('image.imageSha256 invalid');
  }
  const size = layout.alignedSize;
  if (!(Array.isArray(size) && size.length === 2 && size.every((v) => isIntIn(v, 1, 100000)))) push('alignedSize invalid');
  if (typeof layout.dewarped !== 'boolean') push('dewarped invalid');
  if (layout.geometry !== 'exact' && layout.geometry !== 'approx') push('geometry invalid');
  else if (typeof layout.dewarped === 'boolean' && (layout.geometry === 'approx') !== layout.dewarped) {
    push('geometry must be "approx" exactly when dewarped');
  }
  if (!isStrArray(layout.prepOps)) push('prepOps invalid');
  if (typeof layout.review !== 'boolean') push('review invalid');
  const s = layout.sanity;
  if (!isPlainObject(s) || ![s.nSuspect, s.foreignRows, s.uncovered].every((v) => isIntIn(v, 0, Number.MAX_SAFE_INTEGER))) {
    push('sanity invalid');
  }
  const g = layout.gutters;
  if (!(g === null || (Array.isArray(g) && g.every((x) => Array.isArray(x) && x.length === 2 && x.every(isInt))))) {
    push('gutters invalid');
  }
  if (!(isStrArray(layout.orderFrames) && layout.orderFrames.length <= MAX_ORDER_FRAMES)) push('orderFrames invalid');

  if (!Array.isArray(layout.lines) || layout.lines.length > MAX_LINES) push('lines invalid');
  else {
    let prevK = -1;
    for (let i = 0; i < layout.lines.length && !full(); i++) {
      const line = layout.lines[i];
      lineProblems(line, i, push);
      if (isPlainObject(line) && isInt(line.k)) {
        if (line.k <= prevK) push(`lines[${i}].k not sorted`);
        prevK = line.k;
      }
    }
  }
  if (!Array.isArray(layout.frames) || layout.frames.length > MAX_FRAMES) push('frames invalid');
  else {
    for (let i = 0; i < layout.frames.length && !full(); i++) frameProblems(layout.frames[i], i, push);
  }
  return errors;
}

/**
 * layout של עמוד אחד → מה נשמר. לעולם לא זורקת ולעולם לא דוחה את התוצאה.
 * @param {any} raw pages[i].layout כפי שהתקבל
 * @param {{imageSha256?: string}|null|undefined} pageMapEntry איבר ה-pageMap של העמוד
 * @returns {{status:'ok'|'absent'|'invalid'|'unsupported_version'|'too_large', layoutJson:string|null,
 *            version:number|null, bytes:number, errors:string[], rejectedJson:string|null,
 *            warnings:{code:string, message:string, source:'site'}[]}}
 */
export function normalizePageLayout(raw, pageMapEntry) {
  const result = (status, extra = {}) => ({
    status, layoutJson: null, version: null, bytes: 0, errors: [], rejectedJson: null, warnings: [], ...extra,
  });
  if (raw === undefined || raw === null) return result('absent');

  let json;
  try {
    json = JSON.stringify(raw);
  } catch {
    json = null;
  }
  const bytes = typeof json === 'string' ? utf8Bytes(json) : 0;
  const keep = typeof json === 'string' && bytes <= SITE_LAYOUT_PAGE_MAX_BYTES ? json : null;
  const version = isPlainObject(raw) && isInt(raw.layoutVersion) ? raw.layoutVersion : null;

  const invalid = (errors, code = 'layout_invalid') => result('invalid', {
    version, bytes, errors: errors.slice(0, MAX_LAYOUT_ERRORS), rejectedJson: keep,
    warnings: [siteWarning(code, errors.slice(0, MAX_LAYOUT_ERRORS).join('; '))],
  });

  if (!isPlainObject(raw) || typeof json !== 'string') return invalid(['layout is not an object']);
  if (raw.layoutVersion !== LAYOUT_VERSION) {
    return result('unsupported_version', {
      version, bytes, rejectedJson: keep,
      errors: [`layoutVersion ${JSON.stringify(raw.layoutVersion ?? null).slice(0, 40)} is not supported`],
      warnings: [siteWarning('layout_version_unsupported', `layoutVersion ${JSON.stringify(raw.layoutVersion ?? null).slice(0, 40)} is not ${LAYOUT_VERSION}`)],
    });
  }
  const keyIssue = keyProblem(raw, 1);
  if (keyIssue) return invalid([keyIssue]);
  if (bytes > SITE_LAYOUT_PAGE_MAX_BYTES) {
    return result('too_large', {
      version, bytes,
      errors: [`layout is ${bytes} bytes, above ${SITE_LAYOUT_PAGE_MAX_BYTES}`],
      warnings: [siteWarning('layout_too_large', `layout is ${bytes} bytes, above ${SITE_LAYOUT_PAGE_MAX_BYTES}; not stored`)],
    });
  }
  const problems = layoutV1Problems(raw);
  if (problems.length > 0) return invalid(problems);
  if (raw.image.imageSha256 !== pageMapEntry?.imageSha256) {
    return invalid(['layout.image.imageSha256 does not match the page image of the job'], 'layout_image_mismatch');
  }
  return result('ok', { layoutJson: json, version, bytes });
}

/**
 * metadata הספר השמור (resultMetadataJson) → התצוגה בממשק הניהול: רק השדות שהממשק צריך.
 * JSON פגום / חסר → null.
 */
export const RESULT_ISSUE_LIST_VIEW_MAX = 50;
export function resultMetadataView(json) {
  if (typeof json !== 'string' || !json) return null;
  let meta;
  try {
    meta = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isPlainObject(meta)) return null;
  const out = {};
  if (isPlainObject(meta.hardware) && Object.hasOwn(meta.hardware, 'gpu')) out.hardware = { gpu: meta.hardware.gpu };
  for (const k of ['models', 'run_seconds', 'otzaria_issues', 'layout', 'salvage', 'service_version', 'bridge_version']) {
    if (Object.hasOwn(meta, k)) out[k] = meta[k];
  }
  if (Array.isArray(meta.otzaria_issue_list)) out.otzaria_issue_list = meta.otzaria_issue_list.slice(0, RESULT_ISSUE_LIST_VIEW_MAX);
  return out;
}
