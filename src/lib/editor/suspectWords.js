// מילים חשודות בטקסט שזוהה (לוגיקה טהורה): ביטחון זיהוי נמוך, חלופות-זיהוי/מודל-שפה,
// וכללי-אצבע של שגיאות OCR בעברית — אות לטינית או ספרה בתוך מילה עברית, אות סופית
// באמצע מילה, אות רגילה (כמנפצ) בסוף מילה, אות שחוזרת שלוש פעמים, פיסוק בין אותיות.

import { lineWords } from './caretWord.js';

/** סף ביטחון ברירת מחדל (0..1) */
export const LOW_CONF = 0.8;

/**
 * @typedef {'low_conf'|'alternatives'|'mixed_script'|'digit_in_word'|'final_mid'|'non_final_end'|'repeated_char'|'inner_punct'} SuspectReason
 * @typedef {{ index: number, start: number, end: number, text: string, reasons: SuspectReason[] }} Suspect
 */

const HEB = /[א-ת]/u;
const LATIN = /[A-Za-z]/u;
const DIGIT = /[0-9]/u;
// אות סופית שאחריה עוד אות עברית
const FINAL_MID = /[ךםןףץ](?=[א-ת])/u;
const NON_FINALS = 'כמנפצ';
const QUOTES = /['"׳״‘’“”`]/u;
const MARKS = /\p{M}/gu;

/**
 * הסיבות לחשוד במילה בודדת לפי צורתה (בלי ביטחון).
 * @param {string} word
 * @returns {SuspectReason[]}
 */
export function shapeReasons(word) {
  const raw = String(word ?? '').replace(MARKS, '');
  // גרעין: בלי פיסוק בקצוות (גרש/גרשיים בפנים נשארים)
  const core = raw.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
  if (!core || !HEB.test(core)) return [];
  /** @type {SuspectReason[]} */
  const out = [];
  // מקף מחבר שתי מילים — בודקים כל חלק לעצמו בכללי האותיות הסופיות
  const parts = core.split(/[־-]/u).filter(Boolean);
  if (LATIN.test(core)) out.push('mixed_script');
  if (DIGIT.test(core)) out.push('digit_in_word');
  const abbrev = QUOTES.test(core);
  if (parts.some((p) => FINAL_MID.test(p))) out.push('final_mid');
  if (!abbrev && parts.some((p) => p.length >= 2 && NON_FINALS.includes(p[p.length - 1]) && HEB.test(p[p.length - 2]))) out.push('non_final_end');
  if (/([א-ת])\1\1/u.test(core)) out.push('repeated_char');
  // פיסוק בין אותיות (לא גרש/גרשיים/מקף): "בר.א"
  if (/[א-ת][.,;:!?()[\]]+[א-ת]/u.test(core)) out.push('inner_punct');
  return out;
}

/**
 * המילים החשודות בשורה.
 * @param {string} lineText
 * @param {{ confs?: (number|null|undefined)[], threshold?: number, alternatives?: Iterable<number>,
 *   shapes?: boolean, splitMaqaf?: boolean }} [opts]
 *   confs — ביטחון לכל מילה (0..1, או 0..100 — מזוהה לבד); alternatives — אינדקסי מילים
 *   שיש להן חלופות-זיהוי / חשד של מודל-שפה; shapes=false — בלי כללי-האצבע
 * @returns {Suspect[]}
 */
export function suspectWords(lineText, { confs = [], threshold = LOW_CONF, alternatives = [], shapes = true, splitMaqaf = false } = {}) {
  const alt = new Set(alternatives);
  const scale = (confs || []).some((c) => typeof c === 'number' && c > 1) ? 100 : 1;
  /** @type {Suspect[]} */
  const out = [];
  for (const w of lineWords(lineText, { splitMaqaf })) {
    /** @type {SuspectReason[]} */
    const reasons = [];
    const c = confs?.[w.i];
    if (typeof c === 'number' && Number.isFinite(c) && c / scale < threshold) reasons.push('low_conf');
    if (alt.has(w.i)) reasons.push('alternatives');
    if (shapes) reasons.push(...shapeReasons(w.text));
    if (reasons.length) out.push({ index: w.i, start: w.start, end: w.end, text: w.text, reasons });
  }
  return out;
}

/**
 * אינדקסי המילים עם חלופות בשורת layout v1 / הגהת-עמודים (alternatives[].i, lm[].i,
 * lm_flags[].i, flags.low_words).
 * @param {any} line
 * @returns {number[]}
 */
export function alternativeIndexes(line) {
  const s = new Set();
  for (const key of ['alternatives', 'lm', 'lm_flags']) for (const a of line?.[key] || []) if (Number.isInteger(a?.i)) s.add(a.i);
  for (const i of line?.flags?.low_words || []) if (Number.isInteger(i)) s.add(i);
  return [...s].sort((a, b) => a - b);
}
