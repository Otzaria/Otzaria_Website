/**
 * איתור הפסקה המדווחת בקובץ הנוכחי ומצב העריכה בתוכה — הכלל היחיד לשאלה "האם הטעות שדווחה עדיין בספר".
 * כל "נקלט" (absorption.js) מותנה ב-fixed מכאן; כללי "כבר תוקן" ישתמשו באותו מודול.
 *
 * 1. זיהוי: האסימונים של שורת הבסיס *מחוץ* לעריכה מיושרים (LCS של rebase-change.js) מול כל שורה וכל חלון של
 *    2–3 שורות לא-ריקות סמוכות (פסקה שפוצלה), אחרי סינון מוקדם באינדקס מילים. הציון (Dice) אינו סופר את טווח
 *    העריכה, כך שעותק מתוקן ועותק שלא תוקן מקבלים אותו ציון. "דומה" = ציון ≥ 0.5.
 * 2. מיפוי: הצ'אנקים של העריכה (diffHunks — אותו חישוב כמו במיזוג השורות) ממופים ביישור. שני אסימונים מכל צד
 *    חייבים להופיע צמודים ובלי שינוי (בקצה הפסקה — גבול שורה). בין העוגנים: ההצעה → fixed; המקור → not_fixed;
 *    טקסט אחר, או עוגן שהשתנה (מילים שנערכו ליד הטעות) → uncertain.
 * 3. fixed רק כש: כל הדומים בקובץ מתוקנים (דומה שלא תוקן או שאי אפשר למפות בו — הטעות אולי עדיין בספר);
 *    נשאר דומה מתוקן מעבר לתאומים המתוקנים שכבר היו בבסיס (עותק זהה שנשאר זהה אינו ראיה ואינו מתחרה);
 *    והדומה המזוהה ≥ 0.75 (או ≥ 0.5 כשהשכנים מהבסיס מאשרים את מקומו) ובפער ≥ 0.2 מהבא אחריו.
 * 4. ובכל מקרה של fixed: חתימות הטעות (אסימוני המקור במקום העריכה עם הקשר שבבסיס מופיע רק בשורת הדיווח) אינן
 *    מופיעות בשום מקום בזרם האסימונים של הקובץ — גם מעבר לגבולות שורות: מקור שזז ופוצל לכמה שורות, אוחד עם שכנה
 *    או הורחב עדיין נושא את הטעות (original_fragment), גם כשבמקומו הישן עומד עותק זהה להצעה.
 * שורה קצרה (פחות מ-4 אסימונים מחוץ לעריכה, למשל כותרת): רק התאמה מלאה של השורה, במקום שהשכנים מהבסיס
 * מאשרים, ובלי שום שורה שמכילה את המקור.
 * locateTarget (המפרסם, כשהקובץ השתנה מאז הבסיס): היעד לכתיבה רק כשהפסקה המדווחת לא תוקנה והיא המופע היחיד בקובץ
 * של המקור ושל הטעות — לעולם לא שורה זהה מפסקה אחרת באינדקס הישן.
 */
import { tokenize, matchPairs, diffHunks } from './rebase-change.js';

export const LOCATE = Object.freeze({ FIXED: 'fixed', NOT_FIXED: 'not_fixed', UNCERTAIN: 'uncertain' });

export const LOCATE_RULE = Object.freeze({
  identify: 0.75, // ציון זיהוי מהתוכן בלבד
  identifyWithContext: 0.5, // ציון זיהוי כשהשכנים מהבסיס מאשרים את המקום
  margin: 0.2, // פער מהדומה הבא
  lookalike: 0.5, // "דומה": כל דומה חייב להיות מתוקן
  anchorTokens: 2, // אסימונים צמודים ובלי שינוי מכל צד של העריכה
  windowLines: 3, // שורות לא-ריקות בחלון (פסקה שפוצלה)
  minOwnTokens: 4, // פחות מזה מחוץ לעריכה — שורה קצרה
  minOwnWords: 2,
  contextLines: 2, // שכנים לא-ריקים מכל צד
  maxWork: 8_000_000, // תאי יישור (LCS) לסריקה אחת; מעבר לזה הקובץ "צפוף" מדי לזיהוי בטוח → uncertain
  maxPostings: 200_000,
  maxCells: 4_000_000,
  maxScan: 20_000_000, // אסימונים שנסרקים בחיפוש חתימות הטעות בקריאה אחת; מעבר לזה → uncertain
});

const PRESENTATION = /[יִ-ﭏ]/g;
const BREAK_TAG = /<br\s*\/?>/gi;
const ASCII_LETTER = /[A-Za-z]/;
const WORD = /[\p{L}\p{N}]/u;
const NEIGHBOR_SCAN = 12;
const LONG_LINE = 40;

/**
 * הסרת תגיות במעבר אחד, בדיוק כמו החלפה גלובלית של <\/?[A-Za-z][^<>]*> במחרוזת ריקה: תגית = "<", "/" אופציונלי,
 * אות לטינית, תווים שאינם "<" או ">", ואז ">". הפלט משמש להשוואה ולאסימונים בלבד, לעולם לא מוצג כ-HTML, ולכן
 * אין כאן ניקוי חוזר עד התייצבות (הוא היה משנה את הנרמול). סריקה ליניארית ולא replace, כדי שבדיקת CodeQL
 * לא תפרש אותה כניקוי HTML חלקי.
 */
function stripTags(s) {
  let out = '';
  let last = 0;
  let i = s.indexOf('<');
  while (i >= 0) {
    let k = i + 1;
    if (s[k] === '/') k += 1;
    if (k < s.length && ASCII_LETTER.test(s[k])) {
      let j = k + 1;
      while (j < s.length && s[j] !== '<' && s[j] !== '>') j += 1;
      if (s[j] === '>') {
        out += s.slice(last, i);
        last = j + 1;
        i = s.indexOf('<', last);
        continue;
      }
    }
    i = s.indexOf('<', i + 1);
  }
  return out + s.slice(last);
}

/** הנרמול של המודול: BOM, צורות הצגה (U+FB1D–FB4F, למשל U+FB33), NFC, תגיות (br → רווח) ורווחים. */
export function canon(s) {
  const text = String(s ?? '').replace(/^﻿/, '').replace(PRESENTATION, (c) => c.normalize('NFKC')).normalize('NFC')
    .replace(BREAK_TAG, ' ');
  return stripTags(text).replace(/\s+/g, ' ').trim();
}
/** אותו נרמול בלי הסרת התגיות — להשוואת השינוי הגולמי (absorption.js, rawPartHeld). */
export function rawCanon(s) {
  return String(s ?? '').replace(/^﻿/, '').replace(PRESENTATION, (c) => c.normalize('NFKC')).normalize('NFC').replace(/\s+/g, ' ').trim();
}
const tokensOfCanon = (c) => tokenize(c).filter((t) => t !== ' ');
export const canonTokens = (s) => tokensOfCanon(canon(s));
const isWord = (t) => WORD.test(t);
const sameTokens = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);
const push = (m, k, v) => {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
};

function dice(a, b) {
  if (!a.length && !b.length) return 1;
  const count = new Map();
  for (const t of a) count.set(t, (count.get(t) || 0) + 1);
  let common = 0;
  for (const t of b) {
    const n = count.get(t);
    if (n) {
      common += 1;
      count.set(t, n - 1);
    }
  }
  return (2 * common) / (a.length + b.length);
}
/** שכן "זהה": אותה שורה מנורמלת, או — בשורות ארוכות — רוב האסימונים משותפים (שכן שנערך מעט). */
const sameText = (a, b) => a === b || (a.length >= LONG_LINE && b.length >= LONG_LINE && dice(tokensOfCanon(a), tokensOfCanon(b)) >= 0.8);

/** עריכה לפי היסטים בשורת הבסיס: [{start, end, text}] → השורה המוצעת. */
export function applySpans(line, spans) {
  let out = String(line ?? '');
  for (const sp of [...(spans || [])].sort((x, y) => y.start - x.start)) out = out.slice(0, sp.start) + (sp.text ?? '') + out.slice(sp.end);
  return out;
}

const indexes = new WeakMap();
/**
 * אינדקס לעותק שורות של קובץ — נבנה פעם אחת לכל מערך שורות (WeakMap) ומשותף לכל הדיווחים על אותו קובץ באצווה:
 * הנרמול והאסימונים של כל שורה, שורה מנורמלת → מקומות, מילה → השורות שבהן היא מופיעה, וסדר השורות הלא-ריקות.
 */
export function lineIndex(lines) {
  let ix = indexes.get(lines);
  if (ix) return ix;
  const n = lines.length;
  const canonLines = new Array(n);
  const toks = new Array(n);
  const byCanon = new Map();
  const byWord = new Map();
  const rank = new Int32Array(n).fill(-1);
  const filled = [];
  for (let i = 0; i < n; i++) {
    const c = canon(lines[i]);
    const t = tokensOfCanon(c);
    canonLines[i] = c;
    toks[i] = t;
    push(byCanon, c, i);
    if (t.length) {
      rank[i] = filled.length;
      filled.push(i);
    }
    const seen = new Set();
    for (const w of t) {
      if (!seen.has(w) && isWord(w)) {
        seen.add(w);
        push(byWord, w, i);
      }
    }
  }
  ix = { lines, canon: canonLines, toks, byCanon, byWord, rank, filled };
  indexes.set(lines, ix);
  return ix;
}

/** הדיווח: אסימוני הבסיס, הצ'אנקים (צ'אנקים קרובים מאוחדים כדי שהעוגנים לא יחפפו), ומה שמחוץ להם. */
function reportedEdit(original, proposed) {
  const B = canonTokens(original);
  const N = canonTokens(proposed);
  const raw = diffHunks(B, N);
  if (!raw) return { error: 'too_large' };
  if (!raw.length) return { error: 'invisible_edit' };
  const K = LOCATE_RULE.anchorTokens;
  // מחיקה/הוספה טהורה בתוך רצף של אסימונים זהים ("או או או") יכולה "לגלוש" — הצ'אנק מורחב על כל הרצף, כדי שהעוגנים
  // יהיו מחוצה לו ולא יתאימו לעותק אחר של אותה מילה.
  for (const h of raw) {
    if (h.e > h.s && h.ne > h.ns) continue; // החלפה אינה גולשת
    const last = () => (h.e > h.s ? B[h.e - 1] : N[h.ne - 1]);
    const first = () => (h.e > h.s ? B[h.s] : N[h.ns]);
    while (h.s > 0 && h.ns > 0 && B[h.s - 1] === N[h.ns - 1] && B[h.s - 1] === last()) {
      h.s -= 1;
      h.ns -= 1;
    }
    while (h.e < B.length && h.ne < N.length && B[h.e] === N[h.ne] && B[h.e] === first()) {
      h.e += 1;
      h.ne += 1;
    }
  }
  const hunks = [];
  for (const h of raw) {
    const prev = hunks.at(-1);
    if (prev && h.s - prev.e < K) hunks[hunks.length - 1] = { s: prev.s, e: Math.max(prev.e, h.e), ns: prev.ns, ne: Math.max(prev.ne, h.ne) };
    else hunks.push({ s: h.s, e: h.e, ns: h.ns, ne: h.ne });
  }
  for (const h of hunks) h.repl = N.slice(h.ns, h.ne);
  for (const h of hunks) h.replWords = h.repl.filter(isWord).length;
  const inHunk = new Uint8Array(B.length);
  for (const h of hunks) inHunk.fill(1, h.s, h.e);
  const wordAt = Uint8Array.from(B, (t) => (isWord(t) ? 1 : 0));
  const words = new Set();
  const own = new Map();
  let outside = 0;
  let ownWords = 0;
  B.forEach((t, i) => {
    if (inHunk[i]) return;
    outside += 1;
    if (!wordAt[i]) return;
    ownWords += 1;
    own.set(t, (own.get(t) || 0) + 1);
    words.add(t);
  });
  return {
    B, N, hunks, inHunk, wordAt, outside, ownWords, own, words, allowance: hunks.reduce((n, h) => n + h.repl.length, 0),
    canonOriginal: canon(original), canonProposed: canon(proposed),
    weak: outside < LOCATE_RULE.minOwnTokens || words.size < LOCATE_RULE.minOwnWords,
  };
}

/** חלון של שורות לא-ריקות (לפי סדרן ב-filled): האסימונים, השורה של כל אסימון, ותחילות/סופי השורות. */
function unitOf(ix, from, to) {
  const toks = [];
  const lineOf = [];
  const starts = new Set();
  const ends = new Set();
  for (let r = from; r <= to; r++) {
    const i = ix.filled[r];
    starts.add(toks.length);
    for (const t of ix.toks[i]) {
      toks.push(t);
      lineOf.push(i);
    }
    ends.add(toks.length);
  }
  return { toks, lineOf, starts, ends };
}

/** חסם עליון לציון (חיתוך מולטי-סט של המילים, בלי יישור) — חוסך LCS בחלונות שאינם יכולים להיות דומים. */
function upperBound(rep, toks) {
  const left = new Map(rep.own);
  let m = 0;
  for (const t of toks) {
    const n = left.get(t);
    if (n) {
      m += 1;
      left.set(t, n - 1);
    }
  }
  return (2 * m) / (rep.ownWords + m);
}

/**
 * יישור הבסיס מול חלון: המיפוי base → חלון, והציון — Dice על *המילים* שמחוץ לעריכה (סימני פיסוק אינם מזהים
 * פסקה): מילים תואמות מול מילות הבסיס ומילים עודפות בחלון בין ההתאמות, חוץ מההצעה עצמה במקום העריכה.
 * התאמות מבודדות רחוקות (אסימון נפוץ בשכן שאוחד) אינן נספרות: רק האשכול הצפוף ביותר.
 */
function align(rep, U) {
  const pairs = matchPairs(rep.B, U, LOCATE_RULE.maxCells);
  if (!pairs) return null;
  const gap = 10 + rep.allowance;
  let best = null;
  for (let a = 0; a < pairs.length;) {
    let b = a + 1;
    while (b < pairs.length && pairs[b][1] - pairs[b - 1][1] <= gap) b += 1;
    let out = 0;
    for (let k = a; k < b; k++) if (!rep.inHunk[pairs[k][0]] && rep.wordAt[pairs[k][0]]) out += 1;
    if (!best || out > best.out) best = { a, b, out };
    a = b;
  }
  if (!best || !best.out) return { score: 0 };
  const toU = new Int32Array(rep.B.length).fill(-1);
  let extra = 0;
  for (let k = best.a; k < best.b; k++) {
    const [i, j] = pairs[k];
    toU[i] = j;
    if (k + 1 === best.b) break;
    const [i2, j2] = pairs[k + 1];
    let gapWords = 0;
    for (let x = j + 1; x < j2; x++) if (isWord(U[x])) gapWords += 1;
    let allow = 0;
    for (const h of rep.hunks) if (i < h.s && h.e <= i2) allow += h.replWords;
    extra += Math.max(0, gapWords - allow);
  }
  const lo = pairs[best.a][1];
  const hi = pairs[best.b - 1][1];
  return { score: (2 * best.out) / (rep.ownWords + best.out + extra), toU, lo, hi, matched: best.b - best.a };
}

function lineStart(unit, j) {
  let s = j;
  while (s > 0 && !unit.starts.has(s)) s -= 1;
  return s;
}
function lineEnd(unit, j) {
  let e = j + 1;
  while (e < unit.toks.length && !unit.ends.has(e)) e += 1;
  return e;
}

/**
 * מיקום הצ'אנק בחלון: [a, b) בין העוגנים, או null כשעוגן חסר/לא צמוד או שגבול הפסקה אינו גבול שורה. בקצה הפסקה
 * הגבול הוא סוף (או תחילת) השורה האחרונה (הראשונה) של המופע — גם כשהפסקה פוצלה בדיוק ליד הטעות.
 */
function mapHunk(rep, h, unit, al) {
  const { toU } = al;
  const K = LOCATE_RULE.anchorTokens;
  const L = rep.B.length;
  const leftN = Math.min(K, h.s);
  const rightN = Math.min(K, L - h.e);
  for (let k = 1; k <= leftN; k++) {
    const j = toU[h.s - k];
    if (j < 0 || (k > 1 && j !== toU[h.s - k + 1] - 1)) return null;
  }
  for (let k = 0; k < rightN; k++) {
    const j = toU[h.e + k];
    if (j < 0 || (k > 0 && j !== toU[h.e + k - 1] + 1)) return null;
  }
  let a = leftN ? toU[h.s - 1] + 1 : null;
  let b = rightN ? toU[h.e] : null;
  if (leftN < K) {
    if (leftN) {
      if (!unit.starts.has(toU[0])) return null;
    } else if (b === null) return null;
    else a = lineStart(unit, Math.min(b, al.lo));
  }
  if (rightN < K) {
    if (rightN) {
      if (!unit.ends.has(toU[L - 1] + 1)) return null;
    } else b = lineEnd(unit, Math.max(a - 1, al.hi));
  }
  return a <= b ? { a, b } : null;
}

function subUnit(unit, from, to) {
  const shift = (set) => new Set([...set].filter((x) => x >= from && x <= to).map((x) => x - from));
  return { toks: unit.toks.slice(from, to), lineOf: unit.lineOf.slice(from, to), starts: shift(unit.starts), ends: shift(unit.ends) };
}

const SEVERITY = { [LOCATE.FIXED]: 0, [LOCATE.UNCERTAIN]: 1, [LOCATE.NOT_FIXED]: 2 };
/**
 * מצב העריכה בכל מופעי הפסקה בחלון: ביישור הראשי, ושוב בשאריות משני צדיו — שני עותקים שאוחדו לשורה אחת (למשל
 * עותק מתוקן ועותק שלא תוקן) הם שני מופעים, והחמור מביניהם קובע. null כשחלק גדול מדי ליישור.
 */
function unitState(rep, unit, al, depth = 0) {
  let worst = regionState(rep, unit, al);
  if (depth >= 3) return worst;
  for (const [from, to] of [[0, al.lo], [al.hi + 1, unit.toks.length]]) {
    if (to <= from) continue;
    const part = subUnit(unit, from, to);
    if (upperBound(rep, part.toks) < LOCATE_RULE.lookalike) continue;
    const more = align(rep, part.toks);
    if (!more) return null;
    if (more.score < LOCATE_RULE.lookalike) continue;
    const st = unitState(rep, part, more, depth + 1);
    if (!st) return null;
    if (SEVERITY[st.status] > SEVERITY[worst.status]) worst = st;
  }
  return worst;
}

function regionState(rep, unit, al) {
  const states = rep.hunks.map((h) => {
    const at = mapHunk(rep, h, unit, al);
    if (!at) return { state: 'unanchored' };
    const span = unit.toks.slice(at.a, at.b);
    const state = sameTokens(span, h.repl) ? 'fixed' : sameTokens(span, rep.B.slice(h.s, h.e)) ? 'not_fixed' : 'other';
    return { state, line: unit.lineOf[Math.min(at.a, unit.toks.length - 1)], text: span.join(' ') };
  });
  const status = states.some((s) => s.state === 'not_fixed') ? LOCATE.NOT_FIXED
    : states.every((s) => s.state === 'fixed') ? LOCATE.FIXED : LOCATE.UNCERTAIN;
  const first = states[0];
  return { status, span: first.state === 'unanchored' ? null : { line: first.line, text: first.text } };
}

/**
 * כל האזורים הדומים לפסקה המדווחת בקובץ (שורה או חלון, ללא חפיפה, הטוב ראשון), עם מצב העריכה בכל אחד.
 * skipLine — שורת הדיווח עצמה (בסריקת הבסיס). { crowded } כשאי אפשר לסרוק בבטחה (מילים נפוצות מדי, יותר מדי
 * מועמדים, או חלון גדול מדי ליישור) — המסקנה אז uncertain.
 */
function lookalikes(rep, ix, skipLine = -1) {
  const R = LOCATE_RULE;
  // לכל שורה: כמה ממילות הפסקה (עם חזרות) עשויות להופיע בה — מהאינדקס, בלי לקרוא את השורה.
  const hits = new Map();
  let postings = 0;
  for (const [w, count] of rep.own) {
    const p = ix.byWord.get(w);
    if (!p) continue;
    postings += p.length;
    if (postings > R.maxPostings) return { crowded: 'postings' };
    for (const i of p) hits.set(i, (hits.get(i) || 0) + count);
  }
  // סינון בטוח: ציון ≥ "דומה" מחייב לפחות שליש ממילות הפסקה בחלון (2m ≥ ½(n + m) ⇒ m ≥ n/3), ואז גם החסם העליון.
  const need = rep.ownWords / 3;
  const hitsAt = (r) => hits.get(ix.filled[r]) || 0;
  const tried = new Set();
  const found = new Map();
  let work = 0;
  for (const i of hits.keys()) {
    const r = ix.rank[i];
    for (let w = 1; w <= R.windowLines; w++) {
      for (let s = r - w + 1; s <= r; s++) {
        const e = s + w - 1;
        const key = s * R.windowLines + w - 1;
        if (s < 0 || e >= ix.filled.length || tried.has(key)) continue;
        tried.add(key);
        let sum = 0;
        for (let k = s; k <= e; k++) sum += hitsAt(k);
        if (sum < need) continue;
        if (skipLine >= 0 && ix.filled[s] <= skipLine && skipLine <= ix.filled[e]) continue;
        const unit = unitOf(ix, s, e);
        if (upperBound(rep, unit.toks) < R.lookalike) continue;
        work += (rep.B.length + 1) * (unit.toks.length + 1);
        if (work > R.maxWork) return { crowded: 'work' };
        const al = align(rep, unit.toks);
        if (!al) return { crowded: 'too_long' };
        if (al.score < R.lookalike) continue;
        // האזור הוא השורות שבהן יש התאמות: חלון ששורת הקצה שלו לא תרמה דבר הוא החלון הקטן יותר.
        const start = unit.lineOf[al.lo];
        const end = unit.lineOf[al.hi];
        const prev = found.get(`${start}:${end}`);
        if (!prev || al.score > prev.score) found.set(`${start}:${end}`, { start, end, score: al.score, unit, al });
      }
    }
  }
  // הטוב ראשון; בשוויון — המופע שמכסה יותר מהפסקה (כולל טווח העריכה: פסקה שפוצלה בדיוק ליד הטעות), ואז הקטן.
  const list = [...found.values()].sort((x, y) => y.score - x.score || y.al.matched - x.al.matched || (x.end - x.start) - (y.end - y.start) || x.start - y.start);
  const regions = [];
  for (const f of list) {
    if (regions.some((g) => f.start <= g.end && g.start <= f.end)) continue;
    const state = unitState(rep, f.unit, f.al);
    if (!state) return { crowded: 'too_long' };
    regions.push({ start: f.start, end: f.end, score: f.score, ...state });
  }
  return { regions };
}

/** השכנים מהבסיס (change.base: השורות שלפני ואחרי, בסדר הקובץ): עד contextLines לא-ריקים מכל צד, הקרוב ראשון. */
function baseContext(context) {
  if (!context || !Array.isArray(context.before) || !Array.isArray(context.after)) return null;
  const pick = (lines) => lines.map(canon).filter(Boolean).slice(0, LOCATE_RULE.contextLines);
  const ctx = { before: pick([...context.before].reverse()), after: pick(context.after) };
  return ctx.before.length + ctx.after.length >= 2 ? ctx : null;
}

/** האם השכנים של האזור [start, end] בקובץ הם השכנים מהבסיס — כולם, או כולם חוץ מאחד כשידועים 3 ומעלה. */
function contextFits(ix, start, end, ctx) {
  if (!ctx) return false;
  const near = (from, dir) => {
    const out = [];
    for (let j = from, steps = 0; j >= 0 && j < ix.canon.length && out.length < LOCATE_RULE.contextLines && steps < NEIGHBOR_SCAN; j += dir, steps += 1) {
      if (ix.canon[j]) out.push(ix.canon[j]);
    }
    return out;
  };
  const up = near(start - 1, -1);
  const down = near(end + 1, 1);
  const known = ctx.before.length + ctx.after.length;
  let score = 0;
  ctx.before.forEach((t, k) => { if (up[k] !== undefined && sameText(up[k], t)) score += 1; });
  ctx.after.forEach((t, k) => { if (down[k] !== undefined && sameText(down[k], t)) score += 1; });
  return score >= (known >= 3 ? known - 1 : known);
}

const regionText = (ix, r) => ix.canon.slice(r.start, r.end + 1).filter(Boolean).join(' ');

function outcome(status, reason, region = null, scores = {}) {
  return {
    status, reason, line: region ? region.start : null, lines: region ? [region.start, region.end] : null, span: region?.span ?? null, scores,
  };
}

function decideStrong(rep, cur, base, ctx) {
  const R = LOCATE_RULE;
  const found = lookalikes(rep, cur);
  if (found.crowded) return outcome(LOCATE.UNCERTAIN, `crowded_${found.crowded}`);
  const { regions } = found;
  const fits = (r) => contextFits(cur, r.start, r.end, ctx);
  const identified = (r) => r.score >= R.identify || (r.score >= R.identifyWithContext && fits(r));
  const scores = { best: regions[0]?.score ?? 0, second: regions[1]?.score ?? 0, lookalikes: regions.length, twins: 0 };
  if (!regions.length) return outcome(LOCATE.UNCERTAIN, 'not_found', null, scores);
  const open = regions.filter((r) => r.status !== LOCATE.FIXED);
  if (open.length) {
    const located = open.find((r) => r.status === LOCATE.NOT_FIXED && identified(r));
    return located ? outcome(LOCATE.NOT_FIXED, 'original_present', located, scores) : outcome(LOCATE.UNCERTAIN, 'lookalike_unresolved', open[0], scores);
  }
  // כל הדומים מתוקנים. תאום מתוקן שכבר היה בבסיס ונשאר זהה אינו ראיה ואינו מתחרה בזיהוי.
  let rest = regions;
  if (base) {
    const twins = lookalikes(rep, base.index, base.lineIndex);
    if (twins.crowded) return outcome(LOCATE.UNCERTAIN, `crowded_base_${twins.crowded}`, null, scores);
    const pool = twins.regions.filter((r) => r.status === LOCATE.FIXED).map((r) => regionText(base.index, r));
    scores.twins = pool.length;
    if (regions.length <= pool.length) return outcome(LOCATE.UNCERTAIN, 'fix_not_new', regions[0], scores);
    rest = regions.filter((r) => {
      const k = pool.indexOf(regionText(cur, r));
      if (k === -1) return true;
      pool.splice(k, 1);
      return false;
    });
    if (!rest.length) return outcome(LOCATE.UNCERTAIN, 'fix_not_new', regions[0], scores);
  }
  const [top, next] = [...rest].sort((x, y) => y.score - x.score || fits(y) - fits(x));
  scores.best = top.score;
  scores.second = next?.score ?? 0;
  if (!identified(top)) return outcome(LOCATE.UNCERTAIN, 'not_identified', top, scores);
  if (next && top.score - next.score < R.margin && !(fits(top) && !fits(next))) return outcome(LOCATE.UNCERTAIN, 'ambiguous', top, scores);
  const held = errorHeld(rep, cur, base);
  if (held !== -1) return heldOutcome(held, scores);
  return outcome(LOCATE.FIXED, 'fixed', top, scores);
}

// ---- הטעות בזרם האסימונים של הקובץ כולו: בלי גבולות שורות (פסקה שפוצלה לכמה שורות, אוחדה או הורחבה) ----

/** מקום בזרם: [r, o] — אסימון o בשורה הלא-ריקה ה-r (ix.filled[r]). n אסימונים אחורה; null לפני תחילת הקובץ. */
function stepBack(ix, r, o, n) {
  let rr = r;
  let oo = o - n;
  while (oo < 0) {
    rr -= 1;
    if (rr < 0) return null;
    oo += ix.toks[ix.filled[rr]].length;
  }
  return [rr, oo];
}
/** המקום הבא בזרם שיש בו אסימון (מדלג על סוף שורה); null בסוף הקובץ. */
function settle(ix, r, o) {
  let rr = r;
  let oo = o;
  while (rr < ix.filled.length && oo >= ix.toks[ix.filled[rr]].length) {
    rr += 1;
    oo = 0;
  }
  return rr < ix.filled.length ? [rr, oo] : null;
}
const tokenAt = (ix, p) => ix.toks[ix.filled[p[0]]][p[1]];

/**
 * מופעי החתימה בזרם — הרצף ברצף, ותנאי הקצה (notBefore/notAfter: האסימון שלפני/אחרי אינו ההוספה; בתחילת/סוף
 * הקובץ התנאי מתקיים). מחזיר את השורה הראשונה של מופע ראשון שאינו כולו בתוך השורות [lo, hi], -1 אם אין, ו-null
 * כשהסריקה חרגה מהתקציב (המסקנה אז שמרנית). הסריקה מתחילה מהמילה הנדירה בחתימה, דרך אינדקס המילים.
 */
function findOutside(ix, sig, lo, hi, budget) {
  const { run } = sig;
  let anchor = -1;
  let fewest = Infinity;
  run.forEach((t, k) => {
    if (!isWord(t)) return;
    const n = ix.byWord.get(t)?.length ?? 0;
    if (n < fewest) {
      fewest = n;
      anchor = k;
    }
  });
  const lines = anchor >= 0 ? ix.byWord.get(run[anchor]) || [] : ix.filled;
  const a = Math.max(anchor, 0);
  for (const i of lines) {
    const toks = ix.toks[i];
    budget.work += toks.length;
    if (budget.work > LOCATE_RULE.maxScan) return null;
    for (let o = 0; o < toks.length; o++) {
      if (toks[o] !== run[a]) continue;
      const s = stepBack(ix, ix.rank[i], o, a);
      if (!s) continue;
      let p = s;
      let k = 0;
      let last = s;
      while (k < run.length) {
        p = settle(ix, p[0], p[1]);
        if (!p || tokenAt(ix, p) !== run[k]) break;
        last = p;
        p = [p[0], p[1] + 1];
        k += 1;
      }
      budget.work += k;
      if (k < run.length) continue;
      if (sig.notBefore !== undefined) {
        const b = stepBack(ix, s[0], s[1], 1);
        if (b && tokenAt(ix, b) === sig.notBefore) continue;
      }
      if (sig.notAfter !== undefined) {
        const f = settle(ix, p[0], p[1]);
        if (f && tokenAt(ix, f) === sig.notAfter) continue;
      }
      const first = ix.filled[s[0]];
      if (first < lo || ix.filled[last[0]] > hi) return first;
    }
  }
  return -1;
}

/**
 * החתימה של החלון [from, to) בשורת המקור: הרצף, ותנאי קצה שמבדיל אותו מכל מופע שלו בהצעה — רק כשהחלון מגיע
 * לתחילת (סוף) השורה וכל מופעיו בהצעה באים אחרי (לפני) אותו אסימון, למשל הוספה בסוף השורה. null — אי אפשר.
 */
function windowSig(B, N, from, to) {
  const run = B.slice(from, to);
  if (!run.length) return null;
  const qs = [];
  for (let q = 0; q + run.length <= N.length; q++) if (run.every((t, k) => N[q + k] === t)) qs.push(q);
  if (!qs.length) return { run };
  const before = N[qs[0] - 1];
  if (from === 0 && before !== undefined && qs.every((q) => N[q - 1] === before)) return { run, notBefore: before };
  const after = N[qs[0] + run.length];
  if (to === B.length && after !== undefined && qs.every((q) => N[q + run.length] === after)) return { run, notAfter: after };
  return null;
}

/** הבסיס תקף לבדיקת ייחוד: שורת הדיווח בו היא המקור (בנרמול). */
const baseOf = (rep, base) => (base?.index && base.index.canon[base.lineIndex] === rep.canonOriginal ? base : null);

/**
 * חתימות הטעות — "המקור עדיין בספר" גם כשהפסקה שזזה פוצלה לשורות, אוחדה עם שכנה או הורחבה. לכל צ'אנק: אסימוני
 * המקור במקום העריכה עם הקשר מצד אחד (ואם שני הצדדים אינם מבדילים מההצעה, או בהוספה — שהטעות בה היא הצומת עצמו —
 * הקשר משני הצדדים). אורך ההקשר: הקצר ביותר שבבסיס מופיע רק בשורת הדיווח ("ספציפי") ושאינו מופיע בהצעה; כשאין
 * כזה — הקצר ביותר שאינו בהצעה (ואז כל מופע שלו חוסם, גם מופע שהיה כבר בבסיס). בלי בסיס תקף: עד anchorTokens
 * אסימוני הקשר, ולפחות אחד.
 */
function signatures(rep, base, budget) {
  if (rep.sigs) return rep.sigs;
  const K = LOCATE_RULE.anchorTokens;
  const { B, N } = rep;
  const L = B.length;
  const b = baseOf(rep, base);
  // אין חלון ספציפי (למשל תאום זהה בבסיס) → הקצר ביותר שיש בו מילה: הרגיש ביותר — כל מופע שלו חוסם.
  const choose = (windows) => {
    let fallback = null;
    for (const [from, to] of windows) {
      const sig = windowSig(B, N, from, to);
      if (!sig) continue;
      if (!b) return { ...sig, specific: false };
      // סימני פיסוק בלבד אינם מזהים מקום (כמו בציון הזיהוי) — רק כגיבוי, אם אין חלון עם מילה.
      const word = sig.run.some(isWord);
      if (word && findOutside(b.index, sig, b.lineIndex, b.lineIndex, budget) === -1) return { ...sig, specific: true };
      if (!fallback || (word && !fallback.run.some(isWord))) fallback = sig;
    }
    return fallback && { ...fallback, specific: false };
  };
  // אורכי ההקשר לצד אחד: עם בסיס — עד קצה השורה; בלי — anchorTokens (או עד הקצה), ולפחות אסימון אחד. בשורה ארוכה
  // לפחות אסימון הקשר אחד (מילה בודדת מופיעה גם בטקסט חדש, ופסקה ארוכה מוגנת גם ב"דומים"); בשורה קצרה גם הצ'אנק
  // לבדו, כשהוא ספציפי (כותרת שפוצלה והחלק עם הטעות זז בלי הקשרו). צ'אנק שהוא השורה כולה — החלון הדו-צדדי.
  const minK = rep.weak ? 0 : 1;
  const lengths = (avail) => (b ? Array.from({ length: avail + 1 - minK }, (_, k) => k + minK) : Math.min(K, avail) ? [Math.min(K, avail)] : []);
  const twoSided = (h) => {
    if (!b) return Math.min(K, h.s) + Math.min(K, L - h.e) ? [[h.s - Math.min(K, h.s), h.e + Math.min(K, L - h.e)]] : [];
    let kl = Math.min(1, h.s);
    let kr = Math.min(1, L - h.e);
    const out = [[h.s - kl, h.e + kr]];
    while (kl < h.s || kr < L - h.e) {
      if (kl < h.s) out.push([h.s - (kl += 1), h.e + kr]);
      if (kr < L - h.e) out.push([h.s - kl, h.e + (kr += 1)]);
    }
    return out;
  };
  const sigs = [];
  const add = (sig) => {
    if (sig && !sigs.some((x) => sameTokens(x.run, sig.run) && x.notBefore === sig.notBefore && x.notAfter === sig.notAfter)) sigs.push(sig);
    return Boolean(sig);
  };
  for (const h of rep.hunks) {
    let found = false;
    if (h.e > h.s) {
      found = add(choose(lengths(h.s).map((k) => [h.s - k, h.e])));
      found = add(choose(lengths(L - h.e).map((k) => [h.s, h.e + k]))) || found;
    }
    if (!found) add(choose(twoSided(h)));
  }
  rep.sigs = sigs;
  return sigs;
}

/** השורה הראשונה בקובץ שבה (או ממנה והלאה, מעבר לשורות) הטעות עדיין נמצאת; -1 אם אין; null — סריקה גדולה מדי. */
function errorHeld(rep, cur, base, lo = -1, hi = -1) {
  const budget = { work: 0 };
  const sigs = signatures(rep, base, budget);
  for (const sig of sigs) {
    const at = findOutside(cur, sig, lo, hi, budget);
    if (at !== -1) return at;
  }
  return -1;
}
const heldOutcome = (held, scores = {}) => (held === null
  ? outcome(LOCATE.UNCERTAIN, 'crowded_scan', null, scores)
  : outcome(LOCATE.UNCERTAIN, 'original_fragment', { start: held, end: held, span: null }, scores));

/** השורה הראשונה של מופע הרצף בזרם האסימונים (גם מעבר לגבולות השורות); -1 אם אין (או סריקה גדולה מדי — שמרני). */
function findRun(ix, run) {
  const at = findOutside(ix, { run }, -1, -1, { work: 0 });
  return at === null ? 0 : at;
}

/** האם השורה מכילה את רצף האסימונים כולו, ברצף. */
function containsRun(toks, run) {
  if (!run.length || run.length > toks.length) return false;
  for (let i = 0; i + run.length <= toks.length; i++) {
    let k = 0;
    while (k < run.length && toks[i + k] === run[k]) k += 1;
    if (k === run.length) return true;
  }
  return false;
}
const startsWith = (toks, run) => run.length <= toks.length && run.every((t, i) => toks[i] === t);
const endsWith = (toks, run) => run.length <= toks.length && run.every((t, i) => toks[toks.length - run.length + i] === t);

/**
 * שורה קצרה ודומה שעדיין נושאת את המקור עם צד אחד של ההקשר שלו (אסימון שכן, או גבול השורה) — למשל כותרת שזזה
 * ושמילה לידה השתנתה. שורות זהות להצעה אינן נבדקות (מחיקת מילה כפולה משאירה את אותה מילה בקצה).
 */
function shortLookalike(rep, cur) {
  const L = rep.B.length;
  const runs = [];
  for (const h of rep.hunks) {
    if (h.e === h.s) continue;
    const span = rep.B.slice(h.s, h.e);
    runs.push(h.s > 0 ? { run: rep.B.slice(h.s - 1, h.e) } : { run: span, atStart: true });
    runs.push(h.e < L ? { run: rep.B.slice(h.s, h.e + 1) } : { run: span, atEnd: true });
  }
  for (let i = 0; i < cur.toks.length; i++) {
    const t = cur.toks[i];
    if (!t.length || Math.abs(t.length - L) > 2 || cur.canon[i] === rep.canonProposed) continue;
    if (runs.some(({ run, atStart, atEnd }) => (atStart ? startsWith(t, run) : atEnd ? endsWith(t, run) : containsRun(t, run)))) return i;
  }
  return -1;
}

/** שורה קצרה: התאמה מלאה בלבד, במקום שהשכנים מהבסיס מאשרים, ובלי שום שורה שמכילה את המקור (כולו, או עם צד אחד של ההקשר). */
function decideWeak(rep, cur, base, ctx) {
  if (!rep.canonOriginal || !rep.canonProposed) return outcome(LOCATE.UNCERTAIN, 'short_empty');
  if (!rep.B.some(isWord)) return outcome(LOCATE.UNCERTAIN, 'short_no_words');
  const fits = (i) => contextFits(cur, i, i, ctx);
  const region = (i) => ({ start: i, end: i, span: { line: i, text: cur.canon[i] } });
  const located = (cur.byCanon.get(rep.canonOriginal) || []).find(fits);
  if (located !== undefined) return outcome(LOCATE.NOT_FIXED, 'original_present', region(located));
  const held = findRun(cur, rep.B);
  if (held >= 0) return outcome(LOCATE.UNCERTAIN, 'original_elsewhere', region(held));
  const similar = shortLookalike(rep, cur);
  if (similar >= 0) return outcome(LOCATE.UNCERTAIN, 'short_lookalike', region(similar));
  if (!ctx) return outcome(LOCATE.UNCERTAIN, 'short_no_context');
  const exact = cur.byCanon.get(rep.canonProposed) || [];
  const neighbors = [...ctx.before, ...ctx.after];
  const fit = exact.filter((i) => fits(i) && !neighbors.includes(cur.canon[i]));
  if (fit.length !== 1) return outcome(LOCATE.UNCERTAIN, fit.length ? 'ambiguous' : 'not_identified');
  if (base && exact.length <= (base.index.byCanon.get(rep.canonProposed)?.length ?? 0)) return outcome(LOCATE.UNCERTAIN, 'fix_not_new', region(fit[0]));
  const kept = errorHeld(rep, cur, base);
  if (kept !== -1) return heldOutcome(kept);
  return outcome(LOCATE.FIXED, 'fixed', region(fit[0]));
}

/**
 * @param {{original:string, proposed?:string, edits?:Array<{start:number,end:number,text:string}>, current:object,
 *   base?:{index:object, lineIndex:number}|null, context?:{before:string[], after:string[]}|null}} input
 *   original — שורת הבסיס; proposed — השורה המוצעת (או edits: היסטים בשורת הבסיס); current/base.index — lineIndex()
 *   של הקובץ הנוכחי ושל הקובץ בבסיס (base.lineIndex — שורת הדיווח בבסיס); context — השורות שלפני/אחרי בבסיס.
 * @returns {{status:'fixed'|'not_fixed'|'uncertain', reason:string, line:(number|null), lines:([number,number]|null),
 *   span:({line:number,text:string}|null), scores:object}}
 */
export function locateEdit(input) {
  return decide(input).result;
}

function decide({ original, proposed = null, edits = null, current, base = null, context = null }) {
  const rep = reportedEdit(original, proposed ?? applySpans(original, edits));
  if (rep.error) return { rep, result: outcome(LOCATE.UNCERTAIN, rep.error) };
  const ctx = baseContext(context);
  return { rep, result: rep.weak ? decideWeak(rep, current, base, ctx) : decideStrong(rep, current, base, ctx) };
}

/**
 * היעד לכתיבה, כשהקובץ השתנה מאז הבסיס (המפרסם): התוצאה של locateEdit, ועוד target — השורה שבה לכתוב, או null.
 * target רק כש: הפסקה המדווחת לא תוקנה (not_fixed) ונמצאת בשורה אחת בדיוק הזהה למקור (בנרמול); היא המופע היחיד
 * בקובץ — של המקור, של פסקה דומה (שורה ארוכה) ושל חתימות הטעות (גם מעבר לגבולות שורות); ההצעה לא נוספה בשום מקום
 * (שורה קצרה); ובבסיס (חובה) לא היה לה תאום וכל חתימות הטעות ספציפיות לשורת הדיווח. אחרת target = null והסיבה
 * ב-targetReason — ספק = ידני, לעולם לא כתיבה במקום אחר.
 * @returns {ReturnType<typeof locateEdit> & {target:(number|null), targetReason:string}}
 */
export function locateTarget(input) {
  const { rep, result } = decide(input);
  const none = (targetReason) => ({ ...result, target: null, targetReason });
  if (result.status !== LOCATE.NOT_FIXED) return none(result.status);
  const cur = input.current;
  const base = baseOf(rep, input.base);
  if (!base) return none('base_required');
  const [line, end] = result.lines ?? [null, null];
  if (line === null || line !== end || cur.canon[line] !== rep.canonOriginal) return none('target_changed');
  const copies = (ix) => ix.byCanon.get(rep.canonOriginal)?.length ?? 0;
  if (copies(cur) !== 1) return none('target_ambiguous');
  if (copies(base.index) !== 1) return none('twin_in_base');
  if (rep.weak) {
    const fixes = (ix) => ix.byCanon.get(rep.canonProposed)?.length ?? 0;
    if (fixes(cur) > fixes(base.index)) return none('target_ambiguous');
  } else {
    if (result.scores.lookalikes !== 1) return none('target_ambiguous');
    const twins = lookalikes(rep, base.index, base.lineIndex);
    if (twins.crowded || twins.regions.length) return none('twin_in_base');
  }
  const budget = { work: 0 };
  const sigs = signatures(rep, base, budget);
  if (!sigs.length || sigs.some((s) => !s.specific)) return none('error_not_specific');
  if (errorHeld(rep, cur, base, line, line) !== -1) return none('target_ambiguous');
  return { ...result, target: line, targetReason: 'unique' };
}
