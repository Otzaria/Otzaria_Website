/**
 * ולידציית גוף הקליטה (CONTRACT §2.2). שדות מדויקים לא עוברים שום נרמול —
 * חריגה נדחית, לעולם לא נחתכת.
 */
import { computeContentDigest, Ocj1Error } from './ocj1.js';

export const LIMITS = {
  originalLine: 20_000,
  proposedText: 20_000,
  contextField: 20_000,
  bodyBytes: 256 * 1024,
  reportId: 128,
};

// שדות התצוגה הישנים: נבדק רק הטיפוס. הם נשמרים ונשלחים במייל מקוצצים (FIELD_CAPS, כמו בלקוח ישן),
// וה-digest מחושב על הערכים שהתקבלו. error_details נושא את בלוק ה-fallback (§2.5), עד 2×20K.
const DISPLAY_FIELDS = ['subject', 'book_title', 'current_ref', 'selected_text', 'error_details', 'context_text', 'file_path', 'source_folder'];

const EXACT_FIELDS = ['original_line', 'original_selection', 'proposed_text', 'context_before', 'context_after'];

function fail(error, status = 400) {
  return { ok: false, status, error };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNullableString = (v) => v === null || typeof v === 'string';

function validateCorrection(c) {
  if (!isObj(c)) return fail('correction_missing');
  for (const f of EXACT_FIELDS) {
    if (f === 'original_line') continue;
    if (c[f] !== undefined && !isNullableString(c[f])) return fail(`invalid_${f}`);
  }
  if (typeof c.original_line !== 'string' || c.original_line.length === 0) return fail('original_line_required');
  if (c.original_line.length > LIMITS.originalLine) return fail('original_line_too_long', 413);
  const proposed = c.proposed_text === undefined ? null : c.proposed_text;
  if (typeof proposed === 'string' && proposed.length > LIMITS.proposedText) return fail('proposed_text_too_long', 413);

  const selection = c.original_selection === undefined ? null : c.original_selection;
  const before = c.context_before ?? '';
  const after = c.context_after ?? '';
  if (typeof before !== 'string' || typeof after !== 'string') return fail('invalid_context');
  if (before.length > LIMITS.contextField || after.length > LIMITS.contextField) return fail('context_too_long', 413);

  let offset = null;
  if (selection !== null) {
    const off = c.selection_offset;
    if (!isObj(off)) return fail('selection_offset_required');
    if (off.unit !== 'utf16_code_units') return fail('selection_offset_unit');
    if (!Number.isSafeInteger(off.start) || !Number.isSafeInteger(off.end)) return fail('selection_offset_invalid');
    if (off.start < 0 || off.end < off.start || off.end > c.original_line.length) return fail('selection_offset_invalid');
    if (c.original_line.substring(off.start, off.end) !== selection) return fail('selection_mismatch');
    if (before + selection + after !== c.original_line) return fail('context_mismatch');
    offset = { unit: off.unit, start: off.start, end: off.end };
  } else if (c.selection_offset != null) {
    return fail('selection_offset_without_selection');
  }

  if (proposed !== null) {
    const reference = selection !== null ? selection : c.original_line;
    if (proposed === reference) return fail('proposal_identical');
  }

  return {
    ok: true,
    correction: {
      originalLine: c.original_line,
      originalSelection: selection,
      selectionOffset: offset,
      proposedText: proposed,
      contextBefore: selection !== null ? before : '',
      contextAfter: selection !== null ? after : '',
    },
  };
}

/** השורה המיועדת לפי הצעה; null כשלא הוצע תיקון. */
export function computeNewLine(correction) {
  if (!correction || correction.proposedText === null || correction.proposedText === undefined) return null;
  if (correction.originalSelection === null || correction.originalSelection === undefined) return correction.proposedText;
  return correction.contextBefore + correction.proposedText + correction.contextAfter;
}

function validateOptionalString(v, max) {
  if (v === undefined || v === null) return true;
  return typeof v === 'string' && v.length <= max;
}

// לקוח ישן מעולם לא נדחה על קידוד; surrogate בודד מוחלף רק לצורך ה-digest.
function legacyDigestSource(raw) {
  const out = { report_kind: 'free_text', location: null, correction: null };
  for (const k of ['book_title', 'current_ref', 'selected_text', 'error_details', 'context_text', 'source_folder', 'file_path', 'library_version']) {
    out[k] = typeof raw[k] === 'string' ? raw[k].toWellFormed() : raw[k];
  }
  return out;
}

/**
 * מאמת גוף בקשה גולמי. מחזיר { ok, schemaVersion, kind, correction, location,
 * sourceHint, client, contentDigest } או { ok:false, status, error }.
 */
export function validateIntakePayload(raw) {
  if (!isObj(raw)) return fail('invalid_json');
  const sv = raw.schema_version;
  if (sv !== undefined && sv !== null && sv !== 1 && sv !== 2) return fail('unsupported_schema_version');
  const schemaVersion = sv === 2 ? 2 : 1;

  if (raw.report_id !== undefined && raw.report_id !== null) {
    if (typeof raw.report_id !== 'string' || raw.report_id.length > LIMITS.reportId) return fail('invalid_report_id');
  }

  let kind = 'free_text';
  let correction = null;
  let location = null;
  let sourceHint = null;
  let client = null;

  if (schemaVersion === 2) {
    if (typeof raw.report_id !== 'string' || !raw.report_id.trim()) return fail('report_id_required');
    if (raw.report_kind !== undefined && raw.report_kind !== 'free_text' && raw.report_kind !== 'text_correction') {
      return fail('invalid_report_kind');
    }
    kind = raw.report_kind === 'text_correction' ? 'text_correction' : 'free_text';
    for (const field of DISPLAY_FIELDS) {
      if (raw[field] != null && typeof raw[field] !== 'string') return fail(`invalid_${field}`);
    }
    if (raw.location != null) {
      if (!isObj(raw.location)) return fail('invalid_location');
      const l = raw.location;
      if (l.line_index != null && (!Number.isSafeInteger(l.line_index) || l.line_index < 0)) return fail('invalid_line_index');
      if (l.book_id != null && !Number.isSafeInteger(l.book_id)) return fail('invalid_book_id');
      if (!validateOptionalString(l.library_build_id, 100) || !validateOptionalString(l.he_ref, 500)) return fail('invalid_location');
      location = {
        lineIndex: l.line_index ?? null,
        bookId: l.book_id ?? null,
        libraryBuildId: l.library_build_id ?? null,
        heRef: l.he_ref ?? null,
      };
    }
    if (raw.source_hint != null) {
      if (!isObj(raw.source_hint)) return fail('invalid_source_hint');
      const h = raw.source_hint;
      if (!validateOptionalString(h.source_folder, 200) || !validateOptionalString(h.source_name, 200) || !validateOptionalString(h.library_relative_path, 1000)
        || !validateOptionalString(h.repo_path, 1000)) return fail('invalid_source_hint');
      sourceHint = {
        sourceFolder: h.source_folder ?? null,
        sourceName: h.source_name ?? null,
        libraryRelativePath: h.library_relative_path ?? null,
        repoPath: h.repo_path ?? null,
      };
    }
    if (raw.client != null) {
      if (!isObj(raw.client)) return fail('invalid_client');
      if (!validateOptionalString(raw.client.app_version, 50) || !validateOptionalString(raw.client.platform, 50)) return fail('invalid_client');
      client = { appVersion: raw.client.app_version ?? null, platform: raw.client.platform ?? null };
    }
    if (kind === 'text_correction') {
      const r = validateCorrection(raw.correction);
      if (!r.ok) return r;
      correction = r.correction;
    } else if (raw.correction != null) {
      return fail('correction_not_allowed_for_free_text');
    }
  }

  let contentDigest;
  try {
    contentDigest = computeContentDigest(schemaVersion === 2 ? raw : legacyDigestSource(raw));
  } catch (e) {
    if (e instanceof Ocj1Error) return fail('invalid_text_encoding');
    throw e;
  }
  if (raw.content_digest !== undefined && raw.content_digest !== null) {
    if (typeof raw.content_digest !== 'string' || raw.content_digest.toLowerCase() !== contentDigest) return fail('digest_mismatch');
  }

  return { ok: true, schemaVersion, kind, correction, location, sourceHint, client, contentDigest };
}
