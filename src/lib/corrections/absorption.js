/**
 * PR של תיקון שנסגר בלי מיזוג אינו בהכרח תיקון שנדחה: מנהל הספרייה בודק כל PR, מחיל אותו בקומיט
 * מקומי מרוכז שנדחף ל-main מאוחר יותר, וסוגר את ה-PR בלי מיזוג. לכן מה שקובע הוא תוכן main.
 * כאן הלוגיקה הטהורה: איתור שורת היעד ב-main (עיגון לשכנים מהבסיס), השוואתה לחבילת השינוי, והמעבר
 * שנגזר מהתוצאה ומזמן ההמתנה. הקריאה מ-GitHub והעדכון ב-DB — ב-closed-pr.js.
 */
import { splitSourceLines } from './source-text.js';
import { LOCATE, canon, canonTokens, lineIndex, locateEdit, rawCanon } from './locate-edit.js';
import { diffHunks, tokenize } from './rebase-change.js';

export const ABSORPTION = Object.freeze({ ABSORBED: 'absorbed', PENDING: 'pending', CHANGED: 'changed' });

/** סיבות ההעברה לידני של דיווח שה-PR שלו נסגר בלי מיזוג (תוויות ב-states.js). */
export const PR_CLOSED_HANDOFF = Object.freeze({
  NOT_ABSORBED: 'pr_closed_not_absorbed',
  CHANGED: 'source_changed_after_pr_close',
  REJECTED: 'pr_rejected_by_maintainer',
  UNVERIFIED: 'pr_closed_unverified',
});

export const CLOSED_PR_ACTION = Object.freeze({
  CLOSE_ABSORBED: 'close_absorbed',
  AWAIT: 'await',
  HANDOFF_NOT_ABSORBED: 'handoff_not_absorbed',
  HANDOFF_CHANGED: 'handoff_changed',
  HANDOFF_REJECTED: 'handoff_rejected',
  HANDOFF_UNVERIFIED: 'handoff_unverified',
});

// תווים מכל צד של העריכה שמזהים את מקומה בשורה (בערך מילה-שתיים).
export const EDIT_CONTEXT_CHARS = 12;
// עיגון: עד כמה שורות לא-ריקות מכל צד, וכמה שורות סורקים כדי למצוא אותן (דילוג על שורות ריקות).
export const ANCHOR_NEIGHBORS = 2;
const ANCHOR_SCAN = 12;
// שורה ארוכה ששכן שלה נערך (למשל תיקון אחר שהוחל יחד) עדיין "אותה שורה": רוב המילים משותפות.
const LONG_LINE_CHARS = 40;
const SAME_LINE_WORDS = 0.8;

const BOM = '﻿';
const isLineIndex = (n) => Number.isSafeInteger(n) && n >= 0;
const noBom = (s) => (s.startsWith(BOM) ? s.slice(1) : s);
const norm = (s) => noBom(String(s ?? '')).normalize('NFC').replace(/\s+/g, ' ').trim();

/**
 * העריכה בין שתי גרסאות של שורה: מה הוסר ומה נוסף בין הקידומת לסיומת המשותפות, ועד context תווים
 * של הקשר מכל צד. כשההקשר הוא כל הקידומת (או הסיומת), העריכה מעוגנת לתחילת (או סוף) השורה.
 */
export function lineEdit(before, after, context = EDIT_CONTEXT_CHARS) {
  const max = Math.min(before.length, after.length);
  let p = 0;
  while (p < max && before[p] === after[p]) p += 1;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s += 1;
  return {
    removed: before.slice(p, before.length - s),
    inserted: after.slice(p, after.length - s),
    left: before.slice(Math.max(0, p - context), p),
    right: before.slice(before.length - s, before.length - s + context),
    atStart: p <= context,
    atEnd: s <= context,
  };
}

function occurrences(line, pattern, { atStart, atEnd }) {
  if (atStart && atEnd) return line === pattern ? 1 : 0;
  if (atStart) return line.startsWith(pattern) ? 1 : 0;
  if (atEnd) return line.endsWith(pattern) ? 1 : 0;
  if (!pattern) return 0;
  let n = 0;
  for (let i = line.indexOf(pattern); i !== -1; i = line.indexOf(pattern, i + 1)) n += 1;
  return n;
}

/**
 * מצב העריכה בשורה, גם כשתיקונים אחרים כבר הוחלו באותה שורה (שורות ארוכות: כמה דיווחים על שורה
 * אחת, ומנהל הספרייה מחיל את כולם יחד). 'applied' — הנוסח החדש בהקשרו נמצא והמקורי לא; 'original'
 * — להפך; 'both' — שניהם (אין דרך לדעת); null — אף אחד (ההקשר עצמו השתנה).
 */
export function editState(line, edit) {
  const applied = occurrences(line, edit.left + edit.inserted + edit.right, edit);
  const original = occurrences(line, edit.left + edit.removed + edit.right, edit);
  if (applied && original) return 'both';
  return applied ? 'applied' : original ? 'original' : null;
}

// ---- השינוי הגולמי (תגיות): האיתור מנורמל ואינו רואה תגיות, ולכן "כבר תוקן"/"נקלט" בודקים אותו בנפרד ----
const TAG_TOKEN = /^<\/?[A-Za-z][^<>]*>$/;
const TAG_RE = /<\/?[A-Za-z][^<>]*>/g; // אותה הגדרת תגית כמו stripTags ב-locate-edit.js
const RAW_TOKEN_RE = /<\/?[A-Za-z][^<>]*>|[\p{L}\p{N}\p{M}]+|\s+|[^\p{L}\p{N}\p{M}\s]/gu;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const isTagToken = (t) => TAG_TOKEN.test(t);
const isTextToken = (t) => !isTagToken(t) && t.trim() !== '';
const tagsOf = (toks) => toks.filter(isTagToken).join('\n');
const pushTo = (m, k, v) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

/**
 * שורה כאסימוני האיתור (בדיוק canonTokens) עם התגיות שביניהם: gaps[k] — התגיות שמיד לפני אסימון k, מחוברות
 * (gaps[toks.length] — אחרי האחרון). null — תגית בתוך מילה (בנרמול היא מתאחדת לאסימון אחד).
 */
function tagModel(line) {
  const s = rawCanon(line);
  const toks = [];
  const gaps = [''];
  const text = (t) => {
    for (const tok of tokenize(t)) {
      if (!tok.trim()) continue;
      toks.push(tok);
      gaps.push('');
    }
  };
  let last = 0;
  for (const m of s.matchAll(TAG_RE)) {
    text(s.slice(last, m.index));
    gaps[gaps.length - 1] += m[0];
    last = m.index + m[0].length;
  }
  text(s.slice(last));
  const ref = canonTokens(line);
  return ref.length === toks.length && ref.every((t, i) => t === toks[i]) ? { toks, gaps } : null;
}

// חלון חלקי (צד אחד של שינוי התגיות, או האסימונים שבתוכו): לפחות כך מילים כשאין בסיס לבדיקת ייחוד.
const PARTIAL_MIN_WORDS = 2;

/**
 * חלונות שמעידים על שינוי התגיות שאושר. לכל צ'אנק בין המקור להצעה (באסימונים גולמיים: תגית שלמה היא אסימון) שמשנה
 * תגיות: אסימוני ההצעה סביבו — עד מילה מכל צד (וכשבצד אחד אין מילה — עד שתיים בצד השני) — והתגיות שבהצעה בין
 * אסימוני החלון, וגם בקצה החלון בצד שבו הצ'אנק עצמו נמצא (בלי הקשר: תחילת השורה או סופה).
 * ועוד חלונות חלקיים, לעותק שפוצל או נערך ליד השינוי (גם המילה שבתוך התגית עצמה) ועדיין נושא את התגית שליד מה
 * שנשאר: מילים משמאל והתגיות שמיד אחריהן, מילים מימין והתגיות שמיד לפניהן, והאסימונים שבתוך הצ'אנק עם התגיות משני
 * צדיהם. חלון חלקי נבחר רק כשהוא מזהה את הפסקה — specific(toks): הקצר ביותר שאינו מופיע בבסיס מחוץ לעותקי הפסקה
 * (ובלי בסיס: PARTIAL_MIN_WORDS מילים לפחות); מילה נפוצה לבדה הייתה "מוצאת" עותקים בכל שורה שנכתבה.
 * null — אי אפשר לחשב (שורה ענקית עם שינוי תגיות, תגית בתוך מילה, או חלון בלי מילה).
 */
function rawWindows(originalLine, newLine, specific) {
  const O = rawCanon(originalLine).match(RAW_TOKEN_RE) || [];
  const N = rawCanon(newLine).match(RAW_TOKEN_RE) || [];
  const hunks = diffHunks(O, N);
  if (!hunks) return tagsOf(O) === tagsOf(N) ? [] : null; // שורה ענקית: בלי שינוי בתגיות — אין מה לבדוק כאן
  const changed = hunks.filter((h) => tagsOf(O.slice(h.s, h.e)) !== tagsOf(N.slice(h.ns, h.ne)));
  if (!changed.length) return [];
  const m = tagModel(newLine);
  if (!m || !tagModel(originalLine)) return null;
  const T = m.toks;
  const before = [0]; // אסימוני איתור לפני כל מקום באסימונים הגולמיים של ההצעה
  for (const t of N) before.push(before.at(-1) + (isTextToken(t) ? 1 : 0));
  const reach = (from, step, words) => {
    let k = 0;
    let w = 0;
    for (let i = from; w < words && i >= 0 && i < T.length; i += step) {
      k += 1;
      if (WORD_CHAR.test(T[i])) w += 1;
    }
    return { k, w };
  };
  const out = [];
  const keys = new Set();
  const hasWord = (ws, we) => T.slice(ws, we).some((t) => WORD_CHAR.test(t));
  // החלון [ws, we) עם התגיות שבין אסימוניו, ובקצה שמסומן — גם התגיות שמיד לפניו/אחריו
  const add = (ws, we, withLead, withTrail) => {
    const w = { toks: T.slice(ws, we), inner: m.gaps.slice(ws + 1, we), lead: withLead ? m.gaps[ws] : undefined, trail: withTrail ? m.gaps[we] : undefined };
    const key = JSON.stringify(w);
    if (!keys.has(key)) {
      keys.add(key);
      out.push(w);
    }
  };
  const words = (from, step) => {
    let n = 0;
    for (let i = from; i >= 0 && i < T.length; i += step) if (WORD_CHAR.test(T[i])) n += 1;
    return n;
  };
  // הצד האחד: הקצר ביותר (ממילה אחת והלאה, עד קצה השורה) שמזהה את הפסקה
  const partial = (from, step, edge) => {
    const all = words(from, step);
    for (let k = 1; k <= all; k++) {
      const r = reach(from, step, k);
      const [ws, we] = step < 0 ? [from + 1 - r.k, from + 1] : [from, from + r.k];
      if (specific(T.slice(ws, we), k)) {
        add(ws, we, edge === 'lead', edge === 'trail');
        return;
      }
    }
  };
  for (const h of changed) {
    const a = before[h.ns];
    const b = before[h.ne];
    let left = reach(a - 1, -1, 1);
    let right = reach(b, 1, 1);
    if (!left.w && right.w) right = reach(b, 1, 2);
    else if (!right.w && left.w) left = reach(a - 1, -1, 2);
    const ws = a - left.k;
    const we = b + right.k;
    if (!hasWord(ws, we)) return null; // הוספת תגית בשורה בלי מילים — אין חלון מעיד
    add(ws, we, !left.k, !right.k);
    partial(a - 1, -1, 'trail');
    partial(b, 1, 'lead');
    if (b > a && specific(T.slice(a, b), T.slice(a, b).filter((t) => WORD_CHAR.test(t)).length)) add(a, b, true, true);
  }
  return out;
}

const tagStreams = new WeakMap();
/**
 * הקובץ כזרם אסימונים אחד (כמו באיתור: בלי שורות ריקות), ולכל אסימון התגיות סביבו: inner[p] — בין p-1 ל-p באותה
 * שורה (גבול שורה → null, שאינו שווה לתגיות של שורה אחת), lead[p]/trail[p] — מיד לפניו/אחריו בשורה שלו. שורה עם
 * תגית בתוך מילה: התגיות שלה אינן ידועות (null). at — אסימון → מקומותיו.
 */
function tagStream(lines) {
  let st = tagStreams.get(lines);
  if (st) return st;
  st = { toks: [], line: [], inner: [], lead: [], trail: [], at: new Map() };
  for (let i = 0; i < lines.length; i++) {
    const m = tagModel(lines[i]);
    const t = m ? m.toks : canonTokens(lines[i]);
    for (let k = 0; k < t.length; k++) {
      pushTo(st.at, t[k], st.toks.length);
      st.toks.push(t[k]);
      st.line.push(i);
      st.lead.push(m ? m.gaps[k] : null);
      st.trail.push(m ? m.gaps[k + 1] : null);
      st.inner.push(k && m ? m.gaps[k] : null);
    }
  }
  tagStreams.set(lines, st);
  return st;
}

const rawCounts = new WeakMap();
const freshMemo = new WeakMap();
/**
 * השורות בקובץ הנוכחי שהקומיטים מאז הבסיס כתבו: כל שורה שאין לה עותק זהה (בנרמול הגולמי) שנשאר מהבסיס, וכל
 * שורה שזהה לשורת המקור (המקור שנשאר, או תאום שלו). שורה שלא השתנתה מהבסיס אינה נספרת: גם אחרי קליטה מלאה היא שם.
 */
function writtenLines(texts, baseLines, originalLine) {
  const hit = freshMemo.get(texts);
  if (hit && hit.base === baseLines && hit.original === originalLine) return hit.fresh;
  let counts = rawCounts.get(baseLines);
  if (!counts) {
    counts = new Map();
    for (const l of baseLines) {
      const k = rawCanon(l);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    rawCounts.set(baseLines, counts);
  }
  const left = new Map(counts);
  const o = rawCanon(originalLine);
  const fresh = texts.map((l) => {
    const k = rawCanon(l);
    const n = left.get(k) || 0;
    if (n) left.set(k, n - 1);
    return !n || k === o;
  });
  freshMemo.set(texts, { base: baseLines, original: originalLine, fresh });
  return fresh;
}

const otherMemo = new WeakMap();
/**
 * הבסיס בלי עותקי הפסקה (שורות שבנרמול זהות למקור או להצעה — שורת הדיווח ותאומיה): חלון חלקי "מזהה את הפסקה"
 * כשאינו מופיע בשום מקום אחר בבסיס.
 */
function otherText(baseLines, change) {
  const hit = otherMemo.get(baseLines);
  if (hit && hit.o === change.originalLine && hit.n === change.newLine) return hit.st;
  const o = canon(change.originalLine);
  const n = canon(change.newLine);
  const st = tagStream(baseLines.map((l) => {
    const c = canon(l);
    return c === o || c === n ? '' : l;
  }));
  otherMemo.set(baseLines, { o: change.originalLine, n: change.newLine, st });
  return st;
}

/** מספר המופעים של רצף האסימונים בזרם (גם מעבר לגבולות שורות). */
function occurrencesIn(st, toks) {
  let r = 0;
  let fewest = Infinity;
  toks.forEach((t, k) => {
    const c = st.at.get(t)?.length ?? 0;
    if (c < fewest) {
      fewest = c;
      r = k;
    }
  });
  let n = 0;
  for (const q of st.at.get(toks[r]) || []) {
    const p = q - r;
    if (p < 0 || p + toks.length > st.toks.length) continue;
    let k = 0;
    while (k < toks.length && st.toks[p + k] === toks[k]) k += 1;
    if (k === toks.length) n += 1;
  }
  return n;
}

/** מופע של החלון בזרם, בשורה שנכתבה, שהתגיות בו אינן כמו בהצעה. */
function wrongCopy(st, w, fresh) {
  const n = w.toks.length;
  let r = 0;
  let fewest = Infinity;
  w.toks.forEach((t, k) => {
    const c = st.at.get(t)?.length ?? 0;
    if (c < fewest) {
      fewest = c;
      r = k;
    }
  });
  for (const q of st.at.get(w.toks[r]) || []) {
    const p = q - r;
    if (p < 0 || p + n > st.toks.length) continue;
    let k = 0;
    while (k < n && st.toks[p + k] === w.toks[k]) k += 1;
    if (k < n) continue;
    if (fresh && !st.line.slice(p, p + n).some((i) => fresh[i])) continue;
    const same = w.inner.every((g, j) => st.inner[p + j + 1] === g)
      && (w.lead === undefined || st.lead[p] === w.lead)
      && (w.trail === undefined || st.trail[p + n - 1] === w.trail);
    if (!same) return true;
  }
  return false;
}

/**
 * האם שינוי התגיות שאושר לא נקלט במלואו (כלל 9). לכל צ'אנק שמשנה תגיות יש חלון של אסימוני ההצעה סביבו (rawWindows);
 * כל מופע שלו בקובץ (גם מעבר לגבולות שורות) — בשורה שנכתבה מאז הבסיס, או בשורה שזהה למקור — חייב לשאת בדיוק את
 * התגיות שבהצעה. כל סטייה (התגית הישנה, תגית שקולה כמו <strong> במקום <b>, תגית זרה שנוספה באמצע כמו <i>, פיצול
 * לשורות בתוך החלון) → true, גם כשבמקום שאותר עומדת שורה זהה להצעה. בלי הבסיס — כל מופע בקובץ נספר. ספק → true.
 * @param {{originalLine:string, newLine:string}} change
 * @param {string[]} texts  הקובץ הנוכחי (שורות)
 * @param {string[]|null} [baseLines]  הקובץ בבסיס
 */
export function rawPartHeld(change, texts, baseLines = null) {
  const hasBase = Array.isArray(baseLines);
  // ייחוד חלון חלקי: אינו מופיע בבסיס מחוץ לעותקי הפסקה (מופע בשורה שנכתבה הוא אז עותק שלה)
  const specific = hasBase
    ? (toks) => occurrencesIn(otherText(baseLines, change), toks) === 0
    : (toks, nWords) => nWords >= PARTIAL_MIN_WORDS;
  const wins = rawWindows(change.originalLine, change.newLine, specific);
  if (wins === null) return true;
  if (!wins.length) return false;
  const st = tagStream(texts);
  const fresh = hasBase ? writtenLines(texts, baseLines, change.originalLine) : null;
  return wins.some((w) => wrongCopy(st, w, fresh));
}

// פירוק הקובץ לשורות — פעם אחת לכל אובייקט קובץ (כמה דיווחים על אותו קובץ באותה אצווה).
const parsedFiles = new WeakMap();
export function fileLines(file) {
  if (Array.isArray(file.texts)) return file.texts;
  let texts = parsedFiles.get(file);
  if (!texts) {
    texts = splitSourceLines(file.content).lines.map((l) => l.text);
    parsedFiles.set(file, texts);
  }
  return texts;
}

// אינדקס סריקה לעותק שורות — נבנה פעם אחת לכל עותק (WeakMap; משותף לכל הדיווחים על אותו קובץ באצווה) ולא לכל
// דיווח: הטקסט המחובר, גולמי ומנורמל, לחיפוש דפוסים בקובץ כולו בחיפוש אחד, ושורה → מקומות.
const scanIndexes = new WeakMap();
function scanIndex(texts) {
  let ix = scanIndexes.get(texts);
  if (ix) return ix;
  const joined = (lines) => {
    const starts = new Int32Array(lines.length);
    let off = 1;
    lines.forEach((t, i) => {
      starts[i] = off;
      off += t.length + 1;
    });
    return { text: `\n${lines.join('\n')}\n`, starts };
  };
  const normed = texts.map(norm);
  const byLine = new Map();
  const byNorm = new Map();
  texts.forEach((t, i) => {
    if (!byLine.has(t)) byLine.set(t, []);
    byLine.get(t).push(i);
    byNorm.set(normed[i], true);
  });
  ix = { raw: joined(texts), norm: joined(normed), byLine, byNorm };
  scanIndexes.set(texts, ix);
  return ix;
}

function lineAt(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= pos) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return at;
}

/** occurrences() לכל שורה בבת אחת, בטקסט המחובר: Map שורה → מספר מופעים (רק שורות עם מופע). */
function occurrencesByLine({ text, starts }, pattern, { atStart, atEnd }) {
  const out = new Map();
  const add = (i) => out.set(i, (out.get(i) || 0) + 1);
  const scan = (needle, lineStartOf) => {
    for (let k = text.indexOf(needle); k !== -1; k = text.indexOf(needle, k + 1)) {
      const at = lineStartOf(k);
      const i = lineAt(starts, at);
      if (i !== -1 && (!atStart || starts[i] === at)) add(i);
    }
  };
  if (atStart && atEnd) scan(`\n${pattern}\n`, (k) => k + 1);
  else if (atStart) scan(`\n${pattern}`, (k) => k + 1);
  else if (atEnd) scan(`${pattern}\n`, (k) => k);
  else if (pattern) scan(pattern, (k) => k);
  return out;
}

/** "אותה שורה": זהה אחרי נרמול רווחים, או — בשורות ארוכות — רוב המילים משותפות. */
export function sameLine(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  if (x.length < LONG_LINE_CHARS || y.length < LONG_LINE_CHARS) return false;
  const A = new Set(x.split(' '));
  const B = new Set(y.split(' '));
  let common = 0;
  for (const w of A) if (B.has(w)) common += 1;
  return common / (A.size + B.size - common) >= SAME_LINE_WORDS;
}

/** עד n שורות לא-ריקות הקרובות ביותר ל-i בכיוון dir (הקרובה ראשונה). */
function nearestNonEmpty(texts, i, dir, n) {
  const out = [];
  for (let j = i + dir, steps = 0; j >= 0 && j < texts.length && out.length < n && steps < ANCHOR_SCAN; j += dir, steps += 1) {
    if (norm(texts[j])) out.push(texts[j]);
  }
  return out;
}

/** השכנים של שורת היעד בבסיס: עד ANCHOR_NEIGHBORS שורות לא-ריקות מכל צד (הקרובה ראשונה). */
export function baseNeighbors(base) {
  if (!base || !Array.isArray(base.before) || !Array.isArray(base.after)) return null;
  const pick = (lines) => lines.filter((l) => norm(l)).slice(0, ANCHOR_NEIGHBORS);
  return { before: pick([...base.before].reverse()), after: pick(base.after) };
}

/**
 * מקום שורת היעד ב-main לפי השכנים שלה בבסיס (הקובץ בזמן האישור): המקום היחיד בטווח שבו השכנים
 * תואמים — כולם, או כולם חוץ מאחד כשידועים שלושה ומעלה (שורה שנוספה בין השכנים, או שכן שנערך).
 * בלי בסיס, בלי שני שכנים לפחות, בלי התאמה או עם כמה מקומות תואמים — אין עיגון.
 * @returns {{at:number} | {none:string}}
 */
export function anchorTarget(texts, lineIndex, base, range) {
  const nb = baseNeighbors(base);
  if (!nb) return { none: 'no_base' };
  const known = nb.before.length + nb.after.length;
  if (known < 2) return { none: 'weak_base' };
  const need = known >= 3 ? known - 1 : known;
  let best = -1;
  let at = [];
  for (let p = Math.max(0, lineIndex - range); p <= Math.min(texts.length - 1, lineIndex + range); p++) {
    const up = nearestNonEmpty(texts, p, -1, nb.before.length);
    const down = nearestNonEmpty(texts, p, 1, nb.after.length);
    let score = 0;
    nb.before.forEach((line, k) => { if (up[k] !== undefined && sameLine(up[k], line)) score += 1; });
    nb.after.forEach((line, k) => { if (down[k] !== undefined && sameLine(down[k], line)) score += 1; });
    if (score > best) [best, at] = [score, [p]];
    else if (score === best) at.push(p);
  }
  if (best < need) return { none: 'not_found' };
  if (at.length !== 1) return { none: 'ambiguous' };
  // שורה שנראית כמו אחד השכנים עצמם אינה שורת היעד (למשל שכן שזז אל מקום היעד).
  if ([...nb.before, ...nb.after].some((line) => sameLine(texts[at[0]], line))) return { none: 'ambiguous' };
  return { at: at[0] };
}

/**
 * האם השינוי (original_line → new_line בשורה line_index) נקלט ב-main.
 * שורת היעד מאותרת קודם לפי השכנים שלה בבסיס (change.base: השורות שלפניה ואחריה בזמן האישור), ורק
 * בה בודקים: השורה כולה זהה להצעה או למקור, או — כשהוחלו באותה שורה גם תיקונים אחרים — העריכה עצמה
 * בהקשרה. מופע של הנוסח המתוקן בשורה אחרת אינו ראיה (ייתכן שהיה שם כבר בבסיס).
 * בלי עיגון (אין בסיס, או שהשכנים לא נמצאו) נבדקת רק השורה במקומה המקורי, ו"נקלט" רק כשהמקור
 * (השורה או העריכה) אינו נמצא עד relocationLines שורות ממנה. הזזה בלי עיגון אינה ראיה לקליטה.
 * - absorbed: התיקון בשורת היעד והמקור לא — והמקור (השורה או העריכה) אינו מופיע בשום מקום בקובץ כולו
 *   (מופע רחוק שנשאר שלם → pending/original_elsewhere). - pending: המקור עדיין שם.
 * - changed: כל השאר — נוסח אחר, עמימות, קובץ חסר או שאינו UTF-8 תקין. ספק = ידני, לעולם לא "נקלט".
 * כלל 6: כל "נקלט" מותנה גם באיתור (locate-edit.js) — הפסקה המדווחת מזוהה בקובץ בביטחון, ובמקום שהעריכה ממופה
 * אליו המקור איננו וההצעה ישנה, וכל פסקה דומה בקובץ מתוקנת. not_fixed → pending (original_located); ספק →
 * changed (unlocated_<סיבה>). הבדיקות שכאן נשארות כתנאים שמרניים נוספים.
 * כלל 8: האיתור אינו רואה תגיות — "נקלט" גם דורש שבשום מקום בקובץ אין עותק שבו המילה תוקנה ושינוי התגיות שאושר
 * לא (rawPartHeld) → changed (raw_part_not_applied). כלל 9: "עותק" כזה הוא כל מופע של המילים שסביב שינוי התגיות
 * בשורה שנכתבה מאז הבסיס, שהתגיות בו אינן בדיוק כמו בהצעה (גם תגית שקולה או זרה שנוספה באמצע).
 * @param {{content?:string, texts?:string[], lossy?:boolean}|null} file  הקובץ ב-main (null = אינו קיים)
 * @param {{lineIndex:number, originalLine:string, newLine:string, base?:{before:string[], after:string[]}|null, baseLines?:string[]|null}} change
 *   base — שכני שורת היעד בבסיס (לעיגון); baseLines — הקובץ המלא בבסיס, כשידוע (לבדיקה בלי עיגון)
 * @param {{relocationLines?:number, editContext?:number, requireBase?:boolean}} [opts]
 *   requireBase — כל "נקלט" (גם מעוגן) דורש את הבסיס המלא (baseLines); בלעדיו התוצאה changed/base_required (ייצור: תמיד true)
 * @returns {{outcome:'absorbed'|'pending'|'changed', detail:string, lineIndex:(number|null), relocated:boolean, anchored:boolean}}
 */
export function evaluateAbsorption(file, change, { relocationLines = 0, editContext = EDIT_CONTEXT_CHARS, requireBase = false } = {}) {
  let anchored = false;
  const verdict = (outcome, detail, lineIndex = null) => ({ outcome, detail, lineIndex, relocated: lineIndex !== null && lineIndex !== change.lineIndex, anchored });
  if (!file) return verdict(ABSORPTION.CHANGED, 'target_missing');
  if (file.lossy) return verdict(ABSORPTION.CHANGED, 'non_utf8_source');
  if (!isLineIndex(change.lineIndex) || typeof change.originalLine !== 'string' || typeof change.newLine !== 'string') {
    return verdict(ABSORPTION.CHANGED, 'no_target_line');
  }
  const texts = fileLines(file);
  const li = change.lineIndex;
  const orig = noBom(change.originalLine);
  const fresh = noBom(change.newLine);
  const edit = lineEdit(orig, fresh, editContext);
  const stateOf = (i) => {
    if (!(i >= 0 && i < texts.length)) return null;
    if (texts[i] === fresh) return 'applied';
    if (texts[i] === orig) return 'original';
    return editState(texts[i], edit);
  };
  const exact = (i, text) => texts[i] === text;
  // מספר מופעי התיקון (לא מספר שורות): פיצול פסקה ליד העריכה מגדיל את מספר השורות הנושאות אותו בלי תיקון.
  const appliedPattern = edit.left + edit.inserted + edit.right;
  // מופעי התיקון בכל שורה (שורה שהיא ההצעה כולה — לפחות 1), דרך אינדקס הסריקה (פעם אחת לכל עותק בהערכה): רק שורות שיש בהן מופע או שהן ההצעה כולה.
  const fixMemo = new Map();
  const fixCounts = (lines) => {
    if (!fixMemo.has(lines)) {
      const ix = scanIndex(lines);
      const m = occurrencesByLine(ix.raw, appliedPattern, edit);
      for (const i of ix.byLine.get(fresh) || []) m.set(i, Math.max(m.get(i) || 0, 1));
      fixMemo.set(lines, m);
    }
    return fixMemo.get(lines);
  };
  const countFix = (lines, lo, hi) => {
    let n = 0;
    for (const [i, c] of fixCounts(lines)) if (i >= lo && i <= hi) n += c;
    return n;
  };

  // "נקלט" דורש שהמקור (השורה או העריכה, באותו נרמול של המודול) לא יופיע בשום מקום בקובץ כולו — לא רק בחלון
  // ההזזה. פסקה מקורית שזזה רחוק ונשארה שלמה פירושה שהשגיאה עדיין בספר, גם אם נוסח מתוקן אחר קיים בקובץ.
  const normOrig = norm(orig);
  const normEdit = lineEdit(normOrig, norm(fresh), editContext);
  const originalAnywhere = () => {
    const ix = scanIndex(texts);
    return (normOrig !== '' && ix.byNorm.has(normOrig))
      || occurrencesByLine(ix.raw, edit.left + edit.removed + edit.right, edit).size > 0
      || occurrencesByLine(ix.norm, normEdit.left + normEdit.removed + normEdit.right, normEdit).size > 0;
  };
  // הכלל המשותף: הפסקה המדווחת עצמה מזוהה, ובה — במקום העריכה — המקור איננו וההצעה ישנה.
  const baseLines = Array.isArray(change.baseLines) ? change.baseLines : null;
  const locate = () => locateEdit({
    original: orig, proposed: fresh, current: lineIndex(texts),
    base: baseLines ? { index: lineIndex(baseLines), lineIndex: li } : null,
    context: change.base ?? (baseLines ? { before: baseLines.slice(Math.max(0, li - ANCHOR_SCAN), li), after: baseLines.slice(li + 1, li + 1 + ANCHOR_SCAN) } : null),
  });
  const absorbed = (detail, at) => {
    if (originalAnywhere()) return verdict(ABSORPTION.PENDING, 'original_elsewhere', at);
    const loc = locate();
    if (loc.status === LOCATE.NOT_FIXED) return verdict(ABSORPTION.PENDING, 'original_located', loc.line);
    if (loc.status !== LOCATE.FIXED) return verdict(ABSORPTION.CHANGED, `unlocated_${loc.reason}`, at);
    // כלל 8: גם שינוי התגיות שאושר נקלט — בשום מקום בקובץ אין עותק שבו המילה תוקנה והתגיות לא (או שארית שלהן)
    if (rawPartHeld({ originalLine: orig, newLine: fresh }, texts, baseLines)) return verdict(ABSORPTION.CHANGED, 'raw_part_not_applied', at);
    return verdict(ABSORPTION.ABSORBED, detail, at);
  };

  const anchor = anchorTarget(texts, li, change.base, relocationLines);
  if (anchor.at !== undefined) {
    anchored = true;
    const at = anchor.at;
    const moved = at === li ? '' : '_relocated';
    const st = stateOf(at);
    // הבסיס המלא ידוע: גם בנתיב המעוגן הראיה חייבת להיות חדשה. עותק כפול שכבר נשא את התיקון בבסיס
    // (והעיגון ננעל עליו) אינו ראיה — בקובץ כולו מספר מופעי התיקון חייב לעלות לעומת הבסיס.
    if (st === 'applied' && Array.isArray(change.baseLines) && countFix(texts, 0, texts.length - 1) <= countFix(change.baseLines, 0, change.baseLines.length - 1)) {
      return verdict(ABSORPTION.CHANGED, 'fix_not_new', at);
    }
    // בלי הבסיס המלא גם העיגון אינו ראיה מספקת: הוא עלול להינעל על עותק כפול שכבר נשא את התיקון בבסיס, ורק
    // השוואת הבסיס תופסת זאת. טעות כאן מאבדת תיקון בשקט, לכן ממתינים (ובודקים שוב עם הבסיס).
    if (st === 'applied' && requireBase && !Array.isArray(change.baseLines)) return verdict(ABSORPTION.CHANGED, 'base_required', at);
    if (st === 'applied') return absorbed(`${exact(at, fresh) ? 'applied' : 'edit_applied'}${moved}`, at);
    if (st === 'original') return verdict(ABSORPTION.PENDING, exact(at, orig) ? `original${moved || '_in_place'}` : `edit_pending${moved}`, at);
    return verdict(ABSORPTION.CHANGED, st === 'both' ? 'ambiguous' : 'line_changed');
  }

  // בלי עיגון (למשל מנהל הספרייה פיצל או איחד פסקאות, והשכנים השתנו): שורת היעד במקומה, ורק כשהמקור
  // אינו בסביבה. כשהבסיס המלא ידוע (change.baseLines) — "ראיה" רק כשנוסף בדיוק מופע אחד של התיקון
  // לעומת הבסיס: מופע שהיה שם כבר בבסיס אינו ראיה, גם כשהשורה שלו זזה אל היעד או נערכה.
  const from = Math.max(0, li - relocationLines);
  const to = Math.min(texts.length - 1, li + relocationLines);
  const near = { original: [], applied: [] };
  // שורה ריקה (מחיקת תוכן השורה) נמצאת בכל מקום — אינה ראיה מחוץ לשורת היעד.
  const freshIsEvidence = Boolean(fresh.trim());
  for (let i = from; i <= to; i++) {
    if (i === li) continue;
    const st = stateOf(i);
    if (st === 'original' || st === 'both') near.original.push(i);
    if ((st === 'applied' || st === 'both') && freshIsEvidence) near.applied.push(i);
  }
  const carriesFix = (line) => line === fresh || ['applied', 'both'].includes(editState(line, edit));
  // חלון רחב יותר בבסיס: שורות שזזו עדיין נספרות כ"היו שם קודם" (כיוון זהיר).
  const addedFix = () => (baseLines ? countFix(texts, from, to) - countFix(baseLines, li - 2 * relocationLines, li + 2 * relocationLines) : null);
  const here = stateOf(li);
  if (here === 'applied') {
    if (near.original.length) return verdict(ABSORPTION.CHANGED, 'original_nearby');
    // שורה ריקה ביעד (מחיקת תוכן השורה) אינה ראיה כשהמקורית עדיין בקובץ — שורות זזו.
    if (!fresh.trim() && texts.includes(orig)) return verdict(ABSORPTION.CHANGED, 'ambiguous');
    const added = addedFix();
    // בלי עיגון ובלי הבסיס המלא אין דרך לדעת שהתיקון חדש: ממתינים (ובודקים שוב עם הבסיס), לעולם לא "נקלט".
    if (added === null && requireBase) return verdict(ABSORPTION.CHANGED, 'base_required');
    if (added !== null && added !== 1) return verdict(ABSORPTION.CHANGED, 'fix_not_new');
    return absorbed(exact(li, fresh) ? 'applied' : 'edit_applied', li);
  }
  if (here === 'original') return verdict(ABSORPTION.PENDING, exact(li, orig) ? 'original_in_place' : 'edit_pending', li);
  if (here === 'both') return verdict(ABSORPTION.CHANGED, 'ambiguous');
  // שורת היעד אינה אף אחת מהן: "ממתין" כשהמקור זז בלי שינוי; "נקלט" רק עם הבסיס המלא, כשנוסף מופע אחד.
  const origAt = texts.indexOf(orig);
  const origUnique = origAt !== -1 && texts.indexOf(orig, origAt + 1) === -1;
  if (!near.applied.length && origUnique) return verdict(ABSORPTION.PENDING, 'original_relocated', origAt);
  if (!near.applied.length && near.original.length === 1) return verdict(ABSORPTION.PENDING, 'edit_pending_relocated', near.original[0]);
  if (near.applied.length && !near.original.length && addedFix() === 1) {
    const fresh1 = near.applied.filter((i) => !baseLines.some((b, j) => Math.abs(j - li) <= 2 * relocationLines && carriesFix(b) && sameLine(b, texts[i])));
    const at = fresh1.length === 1 ? fresh1[0] : near.applied.length === 1 ? near.applied[0] : null;
    return absorbed(at !== null && exact(at, fresh) ? 'applied_relocated' : 'edit_applied_relocated', at);
  }
  return verdict(ABSORPTION.CHANGED, near.applied.length ? 'relocated_unanchored' : near.original.length ? 'ambiguous' : 'line_changed');
}

/** סיבת ההעברה לידני של מעבר, או null למעבר שאינו העברה לידני. */
export function handoffReasonOf(action) {
  return {
    [CLOSED_PR_ACTION.HANDOFF_CHANGED]: PR_CLOSED_HANDOFF.CHANGED,
    [CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED]: PR_CLOSED_HANDOFF.NOT_ABSORBED,
    [CLOSED_PR_ACTION.HANDOFF_REJECTED]: PR_CLOSED_HANDOFF.REJECTED,
    [CLOSED_PR_ACTION.HANDOFF_UNVERIFIED]: PR_CLOSED_HANDOFF.UNVERIFIED,
  }[action] ?? null;
}

/** תום ההמתנה לקליטה: מרגע שהסגירה זוהתה. */
export const absorptionDeadline = (closedAt, graceSeconds) => new Date(new Date(closedAt).getTime() + graceSeconds * 1000);

/** בתום ההמתנה, לפי התוצאה האחרונה שנבדקה (או בלי בדיקה מוצלחת כלל). */
export function expiredAction(lastOutcome) {
  if (lastOutcome === ABSORPTION.CHANGED) return CLOSED_PR_ACTION.HANDOFF_CHANGED;
  if (lastOutcome === ABSORPTION.PENDING) return CLOSED_PR_ACTION.HANDOFF_NOT_ABSORBED;
  return CLOSED_PR_ACTION.HANDOFF_UNVERIFIED;
}

/**
 * המעבר לדיווח שה-PR שלו נסגר בלי מיזוג: תווית דחייה של מנהל הספרייה → ידני מיד (תווית לעולם אינה
 * מקצרת את בדיקת התוכן בכיוון ההפוך); נקלט → נסגר כפורסם; אחרת ממתינים עד graceSeconds מזיהוי
 * הסגירה — גם כשהשורה "שונתה", כי תיקון שכן שנדחף קודם משנה את ההקשר — ובתום ההמתנה לידני.
 * @param {{outcome:string}} verdict  תוצאת evaluateAbsorption
 * @param {{closedAt:Date, now:Date, graceSeconds:number, rejected?:boolean}} timing
 */
export function closedPrAction(verdict, { closedAt, now, graceSeconds, rejected = false }) {
  if (rejected) return CLOSED_PR_ACTION.HANDOFF_REJECTED;
  if (verdict.outcome === ABSORPTION.ABSORBED) return CLOSED_PR_ACTION.CLOSE_ABSORBED;
  return now >= absorptionDeadline(closedAt, graceSeconds) ? expiredAction(verdict.outcome) : CLOSED_PR_ACTION.AWAIT;
}

/** תווית דחייה של מנהל הספרייה על ה-PR (השמות מ-config, בלי תלות ברישיות). */
export function hasRejectedLabel(labels, rejectedLabels) {
  const wanted = new Set((rejectedLabels || []).map((l) => String(l).trim().toLowerCase()));
  return (labels || []).some((l) => wanted.has(String(l).trim().toLowerCase()));
}
