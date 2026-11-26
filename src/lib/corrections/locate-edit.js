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
 * שורה קצרה (פחות מ-4 אסימונים מחוץ לעריכה, למשל כותרת): רק התאמה מלאה של השורה, במקום שהשכנים מהבסיס
 * מאשרים, ובלי שום שורה שמכילה את המקור.
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
});

const PRESENTATION = /[יִ-ﭏ]/g;
const BREAK_TAG = /<br\s*\/?>/gi;
const TAG = /<\/?[A-Za-z][^<>]*>/g;
const WORD = /[\p{L}\p{N}]/u;
const NEIGHBOR_SCAN = 12;
const LONG_LINE = 40;

/** הנרמול של המודול: BOM, צורות הצגה (U+FB1D–FB4F, למשל U+FB33), NFC, תגיות (br → רווח) ורווחים. */
export function canon(s) {
  return String(s ?? '').replace(/^﻿/, '').replace(PRESENTATION, (c) => c.normalize('NFKC')).normalize('NFC')
    .replace(BREAK_TAG, ' ').replace(TAG, '').replace(/\s+/g, ' ').trim();
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
  // המקור עם צד אחד של ההקשר שלו (או, בהוספה, ההקשר משני הצדדים בלי ההוספה): קטע כזה מחוץ לכל פסקה דומה הוא
  // עותק חלקי שעדיין נושא את הטעות.
  const fragments = [];
  for (const h of hunks) {
    if (h.e > h.s) {
      if (h.s >= K) fragments.push(B.slice(h.s - K, h.e));
      if (h.e + K <= B.length) fragments.push(B.slice(h.s, h.e + K));
    } else if (h.s >= K && h.e + K <= B.length) fragments.push(B.slice(h.s - K, h.e + K));
  }
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
    B, hunks, fragments, inHunk, wordAt, outside, ownWords, own, words, allowance: hunks.reduce((n, h) => n + h.repl.length, 0),
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
  const inRegions = new Set();
  for (const r of regions) for (let i = r.start; i <= r.end; i++) inRegions.add(i);
  for (const run of rep.fragments) {
    const at = findRun(cur, run, inRegions);
    if (at >= 0) return outcome(LOCATE.UNCERTAIN, 'original_fragment', { start: at, end: at, span: null }, scores);
  }
  return outcome(LOCATE.FIXED, 'fixed', top, scores);
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

/** השורה הראשונה של מופע הרצף בשורה, או בחלון של עד windowLines שורות לא-ריקות סמוכות (פסקה שפוצלה); -1 אם אין. */
function findRun(ix, run, skip = null) {
  const word = run.filter(isWord).sort((x, y) => (ix.byWord.get(x)?.length ?? 0) - (ix.byWord.get(y)?.length ?? 0))[0];
  const lines = word ? ix.byWord.get(word) || [] : ix.filled;
  for (const i of lines) {
    const r = ix.rank[i];
    for (let w = 1; w <= LOCATE_RULE.windowLines; w++) {
      for (let s = r - w + 1; s <= r; s++) {
        const e = s + w - 1;
        if (s < 0 || e >= ix.filled.length) continue;
        if (skip && ix.filled.slice(s, e + 1).some((x) => skip.has(x))) continue;
        if (containsRun(unitOf(ix, s, e).toks, run)) return ix.filled[s];
      }
    }
  }
  return -1;
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
export function locateEdit({ original, proposed = null, edits = null, current, base = null, context = null }) {
  const rep = reportedEdit(original, proposed ?? applySpans(original, edits));
  if (rep.error) return outcome(LOCATE.UNCERTAIN, rep.error);
  const ctx = baseContext(context);
  return rep.weak ? decideWeak(rep, current, base, ctx) : decideStrong(rep, current, base, ctx);
}
