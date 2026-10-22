// ולידציה של קובץ תוצאה מהעובד המקומי (POST /api/worker/v1/jobs/{id}/result) — מודול טהור.
// תרגום של ResultValidator + ContractShape.ResultProblems מ-Validators.cs בשירות, ושל
// contracts/result.schema.json. העבודה (job) היא רשומת OcrJob (lean) — inputSha256 ו-pageMap
// שלה לא משתנים אחרי היצירה, ולכן אותם בתים תמיד מקבלים אותה תשובה.
//
// כל הבדיקות כאן רצות **לפני** שינוי כלשהו בעמודים (מפרט סעיף 4א): אינדקס שאינו במיפוי, כפילות,
// pageId זר (שדה רשות — השירות לא שולח אותו, אבל אם נשלח הוא חייב להתאים), עמוד בלי טקסט ובלי
// שגיאה — דוחים את כל התוצאה.
//
// נתוני פריסה ועזר (pages[].layout, pages[].warnings, ותוכן metadata) לא נבדקים כאן בכוונה: שום
// בעיה בהם לא דוחה את התוצאה (גם לא layout:"x" או warnings:5). הם מנורמלים לכל עמוד בנפרד בזמן
// ההחלה (localResultLayout.pure.js): layout פגום/גדול מדי מושמט רק מאותו עמוד, עם אזהרה שנשמרת,
// והטקסט נקלט כרגיל. רק metadata שאינו אובייקט נדחה (כמו תמיד — חוזה הצורה של השירות).
//
// הודעות השגיאה באנגלית בכוונה (כמו ב-Validators.cs/FakeSite): הן עוברות לשירות ב-details של
// 422 ולא מוצגות למשתמש באתר.
// imports: אין (נבדק ב-node:test).

export const MAX_RESULT_BYTES = 100 * 1024 * 1024; // = Site:MaxResultBytes בשירות
export const MAX_PAGE_TEXT_CHARS = 2_000_000; // = ResultValidator.MaxPageTextUnits בשירות (1.0.141+): יחידות UTF-16 (String.length), בדיוק הגבול מתקבל
export const RESULT_OUTCOMES = Object.freeze(['success', 'partial', 'failed', 'cancelled']);

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBlank = (s) => typeof s !== 'string' || s.trim().length === 0;

/**
 * בתי הקובץ → מסמך JSON. UTF-8 תקין בלבד (fatal), BOM בתחילה מוסר. מחזיר
 * { ok:true, doc } או { ok:false } — גוף שאינו אובייקט JSON (כולל מערך/מספר) נחשב לא תקין.
 * @param {Uint8Array} bytes
 */
export function parseResultBytes(bytes) {
  try {
    let view = bytes;
    if (view.length >= 3 && view[0] === UTF8_BOM[0] && view[1] === UTF8_BOM[1] && view[2] === UTF8_BOM[2]) {
      view = view.subarray(3);
    }
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(view);
    const doc = JSON.parse(text);
    return isPlainObject(doc) ? { ok: true, doc } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// pdfPageIndex → איבר ה-pageMap של העבודה
export function pageMapByIndex(job) {
  const map = new Map();
  for (const entry of job?.pageMap || []) {
    if (entry && Number.isInteger(entry.pdfPageIndex)) map.set(entry.pdfPageIndex, entry);
  }
  return map;
}

// error אופציונלי: null/חסר — כאילו אין; אחרת אובייקט עם code ו-message מחרוזות
function errorShapeProblems(err, where, errors) {
  if (err == null) return;
  if (!isPlainObject(err)) {
    errors.push(`${where} is not an object`);
    return;
  }
  if (typeof err.code !== 'string') errors.push(`${where}.code is missing`);
  if (typeof err.message !== 'string') errors.push(`${where}.message is missing`);
}

// בעיות צורה (null מפורש / טיפוס שגוי בשדה חובה) — כמו ContractShape.ResultProblems: אם יש,
// לא ממשיכים לבדיקות הערכים (שלא ייגעו בשדה שאינו מה שנראה).
function shapeProblems(doc) {
  const errors = [];
  if (typeof doc.jobId !== 'string') errors.push('jobId is missing');
  if (typeof doc.inputSha256 !== 'string') errors.push('inputSha256 is missing');
  if (typeof doc.pipelineVersion !== 'string') errors.push('pipelineVersion is missing');
  if (doc.metadata != null && !isPlainObject(doc.metadata)) errors.push('metadata is not an object');
  errorShapeProblems(doc.error, 'error', errors);
  if (!Array.isArray(doc.pages)) {
    errors.push('pages is missing');
    return errors;
  }
  doc.pages.forEach((p, i) => {
    if (!isPlainObject(p)) {
      errors.push(`pages[${i}] is not an object`);
      return;
    }
    if (!Number.isSafeInteger(p.pdfPageIndex) || p.pdfPageIndex < 1) errors.push(`pages[${i}].pdfPageIndex invalid`);
    if (p.text != null && typeof p.text !== 'string') errors.push(`pages[${i}].text is not a string`);
    if (p.metadata != null && !isPlainObject(p.metadata)) errors.push(`pages[${i}].metadata is not an object`);
    if (p.pageId != null && typeof p.pageId !== 'string') errors.push(`pages[${i}].pageId is not a string`);
    errorShapeProblems(p.error, `pages[${i}].error`, errors);
  });
  return errors;
}

/**
 * @param {any} doc — המסמך אחרי parseResultBytes
 * @param {{_id:any, inputSha256:string, pageMap:any[]}} job
 * @param {number} byteLength — גודל הקובץ בפועל
 * @param {number} [maxBytes]
 * @returns {{ok:boolean, errors:string[]}}
 */
export function validateResult(doc, job, byteLength, maxBytes = MAX_RESULT_BYTES) {
  if (!isPlainObject(doc)) return { ok: false, errors: ['result is not an object'] };
  const shape = shapeProblems(doc);
  if (shape.length > 0) return { ok: false, errors: shape };

  const errors = [];
  if (doc.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  const outcomeValid = RESULT_OUTCOMES.includes(doc.outcome);
  if (!outcomeValid) errors.push('outcome invalid');
  if (doc.jobId !== String(job._id)) errors.push('jobId mismatch');
  if (doc.inputSha256 !== job.inputSha256) errors.push('inputSha256 mismatch');

  const requested = pageMapByIndex(job);
  const seen = new Set();
  for (const p of doc.pages) {
    const idx = p.pdfPageIndex;
    const entry = requested.get(idx);
    if (!entry) errors.push(`unrequested page ${idx}`);
    else if (seen.has(idx)) errors.push(`duplicate page ${idx}`);
    else seen.add(idx);
    if (entry && p.pageId != null && p.pageId !== String(entry.page)) errors.push(`page ${idx} pageId mismatch`);
    if (p.error != null && isBlank(p.error.code)) errors.push(`page ${idx} error without code`);
    if (p.error == null && typeof p.text !== 'string') errors.push(`page ${idx} has neither text nor error`);
    if (typeof p.text === 'string' && p.text.length > MAX_PAGE_TEXT_CHARS) errors.push(`page ${idx} text too long`);
  }

  if (outcomeValid) {
    switch (doc.outcome) {
      case 'success':
      case 'partial': {
        const missing = [...requested.keys()].filter((i) => !seen.has(i)).sort((a, b) => a - b);
        for (const idx of missing) errors.push(`missing page ${idx}`);
        if (isBlank(doc.pipelineVersion)) errors.push('pipelineVersion missing');
        if (doc.outcome === 'success') {
          if (doc.pages.some((p) => p.error != null)) errors.push('success result contains page errors');
          if (doc.error != null) errors.push('success result has top-level error');
        }
        break;
      }
      case 'failed': {
        const hasTopError = doc.error != null && !isBlank(doc.error.code);
        const allPagesFailed =
          requested.size > 0 &&
          [...requested.keys()].every((i) => seen.has(i)) &&
          doc.pages.every((p) => p.error != null);
        if (doc.error != null && !hasTopError) errors.push('failed result top-level error without code');
        else if (!hasTopError && !allPagesFailed) {
          errors.push('failed result requires top-level error or an error on every requested page');
        }
        break;
      }
      default: // cancelled — הכול מותר
        break;
    }
  }

  if (!Number.isFinite(byteLength) || byteLength > maxBytes) errors.push(`result is ${byteLength} bytes, exceeds ${maxBytes}`);
  return { ok: errors.length === 0, errors };
}

// details של 422: עד 5 שגיאות מחוברות ב-"; " (כמו FakeSite)
export function validationDetails(errors) {
  return errors.slice(0, 5).join('; ');
}
