// הסמן בטקסט → שורה ומילה (לוגיקה טהורה, בלי DOM). חלק משכבת "עקוב אחרי המילה"
// של עורך העמוד: selectionchange נותן היסט-תווים בכל ה-textarea, וכאן הוא הופך
// ל-{שורה, עמודה, מילה} — וההפך (offsetOfWord) לקפיצה מהסריקה לטקסט.
//
// "מילה" = רצף שאינו רווח — כמו tokenize של textModel (עורך הגהת-העמודים) וכמו
// חיתוך המילים בזיהוי (layout v1, tesseract), כדי שאינדקס המילה כאן יתאים לאינדקס
// המילה בסריקה. מקף עברי (־) אינו מפריד כברירת מחדל ("כל־העם" = מילה אחת, כמו
// בזיהוי); splitMaqaf מפצל אחריו. לכל מילה גם "גרעין" (coreStart..coreEnd) — בלי
// פיסוק וסוגריים בקצוות, אבל גרש/גרשיים שבתוך המילה (ר"ת, תוס') נשארים בגרעין.

import { tokenize } from '../pageProof/textModel.js';

const MAQAF = '־';

// פיסוק בקצות המילה שאינו חלק ממנה. גרש/גרשיים ומירכאות בסוף מילה (תוס', ר"ת)
// נשארים בגרעין רק אם קדמה להם אות — ראו coreOf.
const EDGE_PUNCT = /[\p{P}\p{S}]/u;
const QUOTE = /['"׳״‘’“”`]/u;
// אות, ספרה או סימן-ניקוד/טעם (שצמוד לאות שלפניו)
const LETTER = /[\p{L}\p{N}\p{M}]/u;

/**
 * @typedef {{ text: string, start: number, end: number, i: number, coreStart: number, coreEnd: number }} LineWord
 *   start/end — היסטים בתוך השורה (end לא כולל); coreStart/coreEnd — בלי פיסוק בקצוות
 */

/**
 * @typedef {object} CaretInfo
 * @property {number} line       מספר השורה (מ-0)
 * @property {number} col        ההיסט בתוך השורה
 * @property {number} lineStart  היסט תחילת השורה בכל הטקסט
 * @property {number} lineEnd    היסט סוף השורה (לפני ה-\n)
 * @property {string} lineText
 * @property {LineWord[]} words
 * @property {number} word       אינדקס המילה של הסמן; -1 בשורה בלי מילים
 * @property {number} wordStart  תחילת המילה (בתוך השורה); -1 בלי מילה
 * @property {number} wordEnd    סוף המילה (בתוך השורה, לא כולל); -1 בלי מילה
 * @property {boolean} inWord    הסמן בתוך המילה או צמוד לה (ולא ברווח לפניה)
 */

const str = (s) => String(s ?? '');
const clampPos = (pos, len) => {
  const n = Number.isFinite(pos) ? Math.trunc(pos) : 0;
  return Math.max(0, Math.min(n, len));
};

// גרעין המילה: מסירים פיסוק מהקצוות. גרש/גרשיים בסוף שבא מיד אחרי אות (תוס',
// (תוס')) הוא חלק מהמילה — אלא אם המילה נפתחה במירכאה ("שלום") ואז זו מירכאה סוגרת.
function coreOf(text) {
  const ch = Array.from(text);
  let a = 0;
  let b = ch.length;
  let opened = false;
  while (a < b && EDGE_PUNCT.test(ch[a]) && !LETTER.test(ch[a])) {
    if (QUOTE.test(ch[a])) opened = true;
    a++;
  }
  while (b > a && EDGE_PUNCT.test(ch[b - 1]) && !LETTER.test(ch[b - 1])) {
    if (!opened && QUOTE.test(ch[b - 1]) && b - 1 > a && LETTER.test(ch[b - 2])) break;
    b--;
  }
  // חזרה מאינדקס-נקודות-קוד להיסט UTF-16
  const off = (k) => ch.slice(0, k).join('').length;
  return a >= b ? [0, 0] : [off(a), off(b)];
}

/**
 * מילות השורה עם ההיסטים שלהן.
 * @param {string} lineText שורה אחת (בלי \n)
 * @param {{ splitMaqaf?: boolean }} [opts] splitMaqaf — לפצל אחרי מקף עברי (המקף נשאר בחלק הראשון)
 * @returns {LineWord[]}
 */
export function lineWords(lineText, { splitMaqaf = false } = {}) {
  // שמור לפי תוכן השורה: כל הקשה על חץ קוראת לזה שוב ושוב על אותה שורה (בשורת-גוש של אלפי
  // תווים — כמה מילישניות כל פעם). המערך המוחזר משותף — אסור לשנות אותו.
  const key = (splitMaqaf ? '1' : '0') + str(lineText);
  const hit = WORDS_CACHE.get(key);
  if (hit) {
    WORDS_CACHE.delete(key);
    WORDS_CACHE.set(key, hit);
    return hit;
  }
  const out = computeLineWords(str(lineText), splitMaqaf);
  WORDS_CACHE.set(key, out);
  if (WORDS_CACHE.size > WORDS_CACHE_MAX) WORDS_CACHE.delete(WORDS_CACHE.keys().next().value);
  return out;
}

const WORDS_CACHE_MAX = 256;
/** @type {Map<string, LineWord[]>} */
const WORDS_CACHE = new Map();

/**
 * @param {string} lineText
 * @param {boolean} splitMaqaf
 * @returns {LineWord[]}
 */
function computeLineWords(lineText, splitMaqaf) {
  const out = [];
  for (const t of tokenize(lineText)) {
    if (t.w !== 'word') continue;
    const parts = [];
    if (splitMaqaf && t.text.includes(MAQAF)) {
      let s = 0;
      for (let k = 0; k < t.text.length; k++) {
        if (t.text[k] === MAQAF && k + 1 < t.text.length) {
          parts.push([s, k + 1]);
          s = k + 1;
        }
      }
      parts.push([s, t.text.length]);
    } else parts.push([0, t.text.length]);
    for (const [a, b] of parts) {
      const text = t.text.slice(a, b);
      const [ca, cb] = coreOf(text);
      const start = t.start + a;
      out.push({ text, start, end: t.start + b, i: out.length, coreStart: start + ca, coreEnd: start + cb });
    }
  }
  return out;
}

/**
 * היסטי תחילת כל שורה בטקסט (\n מפריד; \r שלפניו נחשב לסוף השורה הקודמת).
 * @param {string} text
 * @returns {number[]}
 */
export function lineStarts(text) {
  const s = str(text);
  const out = [0];
  for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) out.push(i + 1);
  return out;
}

// סוף השורה שמתחילה ב-start — לפני \n (ולפני \r שלפניו)
function lineEndFrom(s, start) {
  let e = s.indexOf('\n', start);
  if (e < 0) e = s.length;
  if (e > start && s[e - 1] === '\r') e--;
  return e;
}

/**
 * המילה של הסמן: זו שהסמן בתוכה או צמוד לה (start ≤ col ≤ end); אחרת — הבאה אחריו;
 * אחרי המילה האחרונה — האחרונה (כמו textModel.wordAt). בלי מילים: -1.
 * @param {LineWord[]} words
 * @param {number} col
 */
export function wordIndexAtCol(words, col) {
  if (!words.length) return -1;
  for (const w of words) if (col <= w.end) return w.i;
  return words[words.length - 1].i;
}

/**
 * מה יש בסמן: שורה, עמודה ומילה.
 * @param {string} text כל הטקסט (ערך ה-textarea)
 * @param {number} pos  היסט הסמן (selectionStart); נקטם לטווח
 * @param {{ splitMaqaf?: boolean }} [opts]
 * @returns {CaretInfo}
 */
export function caretInfo(text, pos, opts = {}) {
  const s = str(text);
  const p = clampPos(pos, s.length);
  let line = 0;
  let lineStart = 0;
  for (let i = s.indexOf('\n'); i >= 0 && i < p; i = s.indexOf('\n', i + 1)) {
    line++;
    lineStart = i + 1;
  }
  const lineEnd = lineEndFrom(s, lineStart);
  const lineText = s.slice(lineStart, lineEnd);
  const col = Math.min(p - lineStart, lineText.length);
  const words = lineWords(lineText, opts);
  const word = wordIndexAtCol(words, col);
  const w = word >= 0 ? words[word] : null;
  return {
    line,
    col,
    lineStart,
    lineEnd,
    lineText,
    words,
    word,
    wordStart: w ? w.start : -1,
    wordEnd: w ? w.end : -1,
    inWord: !!w && col >= w.start && col <= w.end,
  };
}

/**
 * היסט תחילת מילה `word` בשורה `line` בכל הטקסט — לקפיצה מהסריקה לטקסט.
 * מילה שלילית / שורה בלי מילים → תחילת השורה; מילה אחרי האחרונה → סוף המילה האחרונה.
 * שורה שאינה קיימת → -1.
 * @param {string} text
 * @param {number} line
 * @param {number} word
 * @param {{ splitMaqaf?: boolean }} [opts]
 */
export function offsetOfWord(text, line, word, opts = {}) {
  const s = str(text);
  const starts = lineStarts(s);
  if (!Number.isInteger(line) || line < 0 || line >= starts.length) return -1;
  const ls = starts[line];
  const words = lineWords(s.slice(ls, lineEndFrom(s, ls)), opts);
  if (!words.length || !Number.isInteger(word) || word < 0) return ls;
  if (word >= words.length) return ls + words[words.length - 1].end;
  return ls + words[word].start;
}

/**
 * מספר השורות בטקסט (טקסט ריק = שורה אחת ריקה, כמו ב-textarea).
 * @param {string} text
 */
export const lineCount = (text) => lineStarts(text).length;

/**
 * טקסטי כל השורות (בלי \r בסוף).
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  const s = str(text);
  return lineStarts(s).map((ls) => s.slice(ls, lineEndFrom(s, ls)));
}
