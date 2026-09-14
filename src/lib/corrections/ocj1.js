/**
 * OCJ-1 — סריאליזציה קנונית ו-digest (CONTRACT §4). משותף לתוכנה ולאתר;
 * כל שינוי כאן חייב להישאר תואם ל-fixtures בשני הריפו.
 */
import { createHash } from 'crypto';

export class Ocj1Error extends Error {
  constructor(message) {
    super(message);
    this.name = 'Ocj1Error';
    this.code = 'ocj1_invalid';
  }
}

function hasLoneSurrogate(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function encodeString(s) {
  if (hasLoneSurrogate(s)) throw new Ocj1Error('lone surrogate');
  // JSON.stringify תואם בדיוק ל-§4.3 למחרוזות חוקיות (בלי surrogate בודד).
  return JSON.stringify(s);
}

function compareUtf16(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** מחרוזת קנונית לפי OCJ-1. זורק Ocj1Error על קלט פסול. */
export function canonicalJson(value) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Ocj1Error('only safe integers allowed');
    return Object.is(value, -0) ? '0' : String(value);
  }
  if (typeof value === 'string') return encodeString(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Ocj1Error('plain objects only');
    const keys = Object.keys(value).sort(compareUtf16);
    const parts = [];
    for (const k of keys) {
      if (value[k] === undefined) throw new Ocj1Error(`undefined value for key ${k}`);
      parts.push(`${encodeString(k)}:${canonicalJson(value[k])}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new Ocj1Error(`unsupported type ${typeof value}`);
}

export function sha256Hex(str) {
  return createHash('sha256').update(Buffer.from(str, 'utf8')).digest('hex');
}

export function ocj1Digest(value) {
  return sha256Hex(canonicalJson(value));
}

/** קלט ה-change_digest (§4.1) מתוך אובייקט שינוי. */
export function changeDigestInput({ path, base_blob_sha, line_index, original_line, new_line }) {
  return { v: 1, path, base_blob_sha, line_index, original_line, new_line };
}

export function computeChangeDigest(change) {
  return ocj1Digest(changeDigestInput(change));
}

const str = (v) => (typeof v === 'string' ? v : '');

/**
 * קלט ה-content_digest (§4.2) מתוך גוף הבקשה הגולמי (לפני כל נרמול).
 * שדות מחרוזת חסרים = "" ו-line_index חסר = null.
 */
export function contentDigestInput(raw) {
  const loc = raw && typeof raw.location === 'object' && raw.location ? raw.location : null;
  const lineIndex = loc && Number.isSafeInteger(loc.line_index) ? loc.line_index : null;
  const kind = raw?.report_kind === 'text_correction' ? 'text_correction' : 'free_text';
  let correction = null;
  if (kind === 'text_correction' && raw.correction && typeof raw.correction === 'object') {
    const c = raw.correction;
    const off = c.selection_offset && typeof c.selection_offset === 'object' ? c.selection_offset : null;
    correction = {
      original_line: str(c.original_line),
      original_selection: typeof c.original_selection === 'string' ? c.original_selection : null,
      proposed_text: typeof c.proposed_text === 'string' ? c.proposed_text : null,
      selection_offset: off ? { unit: str(off.unit), start: off.start, end: off.end } : null,
    };
  }
  return {
    v: 1,
    report_kind: kind,
    book_title: str(raw?.book_title),
    current_ref: str(raw?.current_ref),
    line_index: lineIndex,
    selected_text: str(raw?.selected_text),
    error_details: str(raw?.error_details),
    context_text: str(raw?.context_text),
    source_folder: str(raw?.source_folder),
    file_path: str(raw?.file_path),
    library_version: str(raw?.library_version),
    correction,
  };
}

export function computeContentDigest(raw) {
  return ocj1Digest(contentDigestInput(raw));
}
