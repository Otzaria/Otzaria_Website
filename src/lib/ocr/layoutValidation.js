import { parsePageNumber } from './gematria';

// מקור אמת יחיד לצורות ה-prefill והתשובות של משימות תיוג מבנה-עמוד
// (OcrLayoutPage.tasks) ולוולידציה שלהן — משותף ללקוח (משוב חי), לשרת
// (שמירת מתנדב + עריכת מנהל) ולייבוא האצוות (בדיקת tasks.jsonl).
// הצורות מתועדות במודל; אוצר-המילים (y_band, book_stream) זהה לפורמט
// resolved.jsonl של פרויקט ה-OCR כדי שלא יהיה תרגום בדרך.

export const TASK_KINDS = ['pagenum', 'header', 'streams', 'zones-full'];

export const TASK_LABELS = {
  pagenum: 'מספר עמוד',
  header: 'כותרת רצה',
  streams: 'חלוקת זרמים',
  'zones-full': 'עמוד מלא',
};

// גבולות שפיות משותפים
const MAX_BANDS = 12;
const MAX_LEGEND = 8;
const MIN_BAND_H = 0.005; // רצועה נמוכה מחצי-אחוז גובה-עמוד אינה זרם אמיתי

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// תיבה בפיקסלים של התמונה: {x,y,width,height}. מחזיר הודעת שגיאה או null.
function checkBox(box, imageWidth, imageHeight) {
  if (!box || typeof box !== 'object') return 'תיבה חסרה';
  const { x, y, width, height } = box;
  if (![x, y, width, height].every(isFiniteNum)) return 'ערכי תיבה אינם מספרים';
  if (x < 0 || y < 0 || width < 2 || height < 2) return 'מידות תיבה לא תקינות';
  // סלאק פיקסל לעיגולים בין לקוח לשרת
  if (imageWidth && x + width > imageWidth + 1) return 'התיבה חורגת מרוחב התמונה';
  if (imageHeight && y + height > imageHeight + 1) return 'התיבה חורגת מגובה התמונה';
  return null;
}

// רצועות זרמים מנורמלות (0..1), ממוינות וללא חפיפה. legendIds — מזהי
// זרמי-הספר המותרים; book_stream רשאי להיות null (זרם עודף/לא משויך).
function checkBands(bands, legendIds) {
  if (!Array.isArray(bands) || bands.length === 0) return 'נדרשת לפחות רצועה אחת';
  if (bands.length > MAX_BANDS) return 'יותר מדי רצועות';
  let prevY1 = -1;
  for (const b of bands) {
    if (!b || typeof b !== 'object') return 'רצועה לא תקינה';
    if (!isFiniteNum(b.y0) || !isFiniteNum(b.y1)) return 'גבולות רצועה אינם מספרים';
    if (b.y0 < 0 || b.y1 > 1.001 || b.y1 - b.y0 < MIN_BAND_H) return 'גבולות רצועה מחוץ לטווח';
    if (b.y0 < prevY1 - 0.002) return 'רצועות חופפות או לא ממוינות';
    prevY1 = b.y1;
    if (b.book_stream !== null && b.book_stream !== undefined) {
      if (!Number.isInteger(b.book_stream)) return 'זהות זרם לא תקינה';
      if (legendIds && !legendIds.has(b.book_stream)) return 'זהות זרם שאינה במקרא';
    }
  }
  return null;
}

// מנקה רצועה לשדות הקנוניים בלבד (השרת שומר רק אותם)
function cleanBand(b) {
  return {
    y0: Math.max(0, Math.min(1, b.y0)),
    y1: Math.max(0, Math.min(1, b.y1)),
    book_stream: Number.isInteger(b.book_stream) ? b.book_stream : null,
  };
}

function cleanBox(box) {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

// ===== ולידציית prefill (בייבוא אצווה) =====

function checkPagenumPrefill(p, w, h) {
  if (!p || typeof p !== 'object') return 'prefill חסר';
  if (p.box !== null && p.box !== undefined) {
    const e = checkBox(p.box, w, h);
    if (e) return e;
  }
  if (!Number.isInteger(p.expected) || p.expected <= 0 || p.expected >= 5000) {
    return 'ערך צפוי לא תקין';
  }
  if (typeof p.hebrew !== 'string' || p.hebrew.length > 8) return 'גימטריה צפויה לא תקינה';
  return null;
}

function checkHeaderPrefill(p, w, h) {
  if (!p || typeof p !== 'object') return 'prefill חסר';
  if (p.box !== null && p.box !== undefined) {
    const e = checkBox(p.box, w, h);
    if (e) return e;
  }
  if (p.y_band !== null && p.y_band !== undefined) {
    if (!Array.isArray(p.y_band) || p.y_band.length !== 2 ||
        !p.y_band.every(isFiniteNum) || p.y_band[0] < 0 || p.y_band[1] > 1 ||
        p.y_band[0] >= p.y_band[1]) {
      return 'רצועת כותרת (y_band) לא תקינה';
    }
  }
  if (p.texts !== undefined &&
      (!Array.isArray(p.texts) || p.texts.length > 10 ||
        p.texts.some((t) => typeof t !== 'string' || t.length > 120))) {
    return 'נוסחי כותרת לא תקינים';
  }
  return null;
}

function checkStreamsPrefill(p) {
  if (!p || typeof p !== 'object') return 'prefill חסר';
  if (!Array.isArray(p.legend) || p.legend.length === 0 || p.legend.length > MAX_LEGEND) {
    return 'מקרא זרמים חסר או גדול מדי';
  }
  const ids = new Set();
  for (const s of p.legend) {
    if (!s || !Number.isInteger(s.id) || s.id < 0 || s.id > 30) return 'מזהה זרם במקרא לא תקין';
    if (ids.has(s.id)) return 'מזהה זרם כפול במקרא';
    ids.add(s.id);
    if (typeof s.label !== 'string' || !s.label || s.label.length > 80) return 'תווית זרם לא תקינה';
  }
  return checkBands(p.bands, ids);
}

/**
 * ולידציית prefill של משימה — בייבוא אצווה. מחזיר הודעת שגיאה או null.
 */
export function validatePrefill(kind, prefill, imageWidth, imageHeight) {
  if (kind === 'pagenum') return checkPagenumPrefill(prefill, imageWidth, imageHeight);
  if (kind === 'header') return checkHeaderPrefill(prefill, imageWidth, imageHeight);
  if (kind === 'streams') return checkStreamsPrefill(prefill);
  if (kind === 'zones-full') {
    if (!prefill || typeof prefill !== 'object') return 'prefill חסר';
    const parts = ['pagenum', 'header', 'streams'].filter((k) => prefill[k]);
    if (!parts.length) return 'עמוד-מלא ללא אף רכיב';
    for (const k of parts) {
      const e = validatePrefill(k, prefill[k], imageWidth, imageHeight);
      if (e) return `${TASK_LABELS[k]}: ${e}`;
    }
    return null;
  }
  return 'סוג משימה לא מוכר';
}

// ===== ולידציית תשובה (שמירת מתנדב / עריכת מנהל) =====

function legendIdsOf(prefill) {
  return new Set((prefill?.legend || []).map((s) => s.id));
}

function checkPagenumAnswer(a) {
  if (!a || typeof a !== 'object') return 'תשובה חסרה';
  if (a.value === null) return null; // "אין מספר עמוד"
  if (typeof a.value !== 'string' || !a.value.trim()) return 'יש להקליד ערך או לסמן שאין מספר';
  if (a.value.length > 12) return 'ערך ארוך מדי';
  if (parsePageNumber(a.value) === null) return 'הערך אינו גימטריה או מספר תקין';
  return null;
}

function checkHeaderAnswer(a, w, h) {
  if (!a || typeof a !== 'object') return 'תשובה חסרה';
  if (a.box === null) return null; // "אין כותרת בעמוד"
  return checkBox(a.box, w, h);
}

function checkStreamsAnswer(a, prefill) {
  if (!a || typeof a !== 'object') return 'תשובה חסרה';
  return checkBands(a.bands, legendIdsOf(prefill));
}

/**
 * ולידציית תשובת משימה מול ה-prefill ומידות התמונה.
 * מחזיר הודעת שגיאה או null.
 */
export function validateAnswer(kind, answer, prefill, imageWidth, imageHeight) {
  if (kind === 'pagenum') return checkPagenumAnswer(answer);
  if (kind === 'header') return checkHeaderAnswer(answer, imageWidth, imageHeight);
  if (kind === 'streams') return checkStreamsAnswer(answer, prefill);
  if (kind === 'zones-full') {
    if (!answer || typeof answer !== 'object') return 'תשובה חסרה';
    for (const k of ['pagenum', 'header', 'streams']) {
      if (!prefill?.[k]) continue; // רכיב שאינו בשאלה — אין תשובה עליו
      const e = validateAnswer(k, answer[k], prefill[k], imageWidth, imageHeight);
      if (e) return `${TASK_LABELS[k]}: ${e}`;
    }
    return null;
  }
  return 'סוג משימה לא מוכר';
}

// ===== נרמול לשמירה =====

/**
 * מנקה תשובה מאומתת לשדות הקנוניים בלבד (מגן מהזרקת שדות זרים ל-Mixed).
 * לקרוא רק אחרי validateAnswer.
 */
export function cleanAnswer(kind, answer) {
  if (kind === 'pagenum') {
    return { value: answer.value === null ? null : answer.value.trim() };
  }
  if (kind === 'header') {
    return { box: answer.box === null ? null : cleanBox(answer.box) };
  }
  if (kind === 'streams') {
    return { bands: answer.bands.map(cleanBand) };
  }
  if (kind === 'zones-full') {
    const out = {};
    if (answer.pagenum) out.pagenum = cleanAnswer('pagenum', answer.pagenum);
    if (answer.header) out.header = cleanAnswer('header', answer.header);
    if (answer.streams) out.streams = cleanAnswer('streams', answer.streams);
    return out;
  }
  return null;
}

/**
 * ממחיש תשובת "המכונה צדקה" מתוך ה-prefill — כדי שהייצוא יקרא תמיד
 * מ-answer, בין אם המתנדב אישר בלחיצה ובין אם תיקן.
 */
export function confirmedAnswerFromPrefill(kind, prefill) {
  if (kind === 'pagenum') {
    return { value: prefill.hebrew || String(prefill.expected) };
  }
  if (kind === 'header') {
    return { box: prefill.box ? cleanBox(prefill.box) : null };
  }
  if (kind === 'streams') {
    return { bands: (prefill.bands || []).map(cleanBand) };
  }
  if (kind === 'zones-full') {
    const out = {};
    for (const k of ['pagenum', 'header', 'streams']) {
      if (prefill?.[k]) out[k] = confirmedAnswerFromPrefill(k, prefill[k]);
    }
    return out;
  }
  return null;
}
