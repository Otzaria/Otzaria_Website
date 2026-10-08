// מודל הטקסט הזורם של עורך הגהת-העמודים: הטקסט של זרם אחד (לשונית) כפסקאות
// רצופות — כמו באוצריא — ולא שורה-לכל-שורה. כל הפונקציות טהורות; "view" =
// הפלט של buildView (ops.js). מקום-הסמן = {lineId, offset}: היסט-תווים בטקסט
// הנוכחי של השורה. עוזרי-העריכה מחזירים *תיאורים* ({kind:'para_start'…});
// שכבת ה-React הופכת אותם לפעולות-חוזה (או descriptorToOp כאן).
//
// מילה = רצף מרבי של תווים שאינם רווח — אותו כלל של view.wordTokens, כך
// שמספר-המילה כאן = האינדקס של words[], alternatives[].i, lm_flags[].i,
// flags.low_words ו-styles.

import { streamInfo, isFurnitureStream } from './vocab.js';
import { hash32 } from './sequences.js';

export const FURNITURE_TAB = '__furniture';
export const FURNITURE_TAB_HE = 'ריהוט הדף';
const FURNITURE_COLOR = '#9ca3af';
// סדר הלשוניות: הזרמים המובנים בסדר הזה, אחריהם מותאמי-הספר (s_*) לפי הופעתם
const CANON = ['main', 'notes', 'notes2', 'notes3', 'margin'];
const HEAD_STYLES = new Set(['h1', 'h2', 'h3']);
// סגנונות שפותחים פסקה חדשה כשהם מתחלפים (גם בלי para_start)
const FORCE_STYLES = new Set(['h1', 'h2', 'h3', 'quote', 'dh']);
// מספר-המילה המרבי ב-para_break (ops.validateOp); מילה 0 = para_start
export const MAX_BREAK_WORD = 500;

const REASON = {
  notInTab: 'השורה אינה בלשונית הזו',
  already: 'כבר יש כאן תחילת פסקה',
  tabEnd: 'סוף הזרם — אין אחריו שורה',
  tabStart: 'תחילת הזרם',
  style: 'כאן מתחלף סגנון-הפסקה (כותרת/ציטוט/דיבור-המתחיל) — כדי לחבר, שנו קודם את סגנון-הפסקה',
  temp: 'שורה שנוצרה בתיקון החיתוך — הפסקאות בה ייקבעו אחרי הזיהוי מחדש',
  notAtBoundary: 'הסמן אינו בגבול של שורה או פסקה',
  tooLong: 'השורה ארוכה מדי לחלוקה כאן',
  furniture: 'ריהוט הדף אינו מחולק לפסקאות',
};

const textOf = (line) => String(line?.text ?? '');
const baseOf = (stream) => String(stream || 'main').replace(/_heading$/, '') || 'main';
const styleOf = (line) => line?.para_style || 'body';
const clampOffset = (offset, text) => Math.max(0, Math.min(Number.isFinite(offset) ? Math.trunc(offset) : 0, text.length));

// ---------- מילים ----------

// פירוק לאסימונים: [{w:'word'|'space', text, start, end, i?}] — i = מספר-המילה
export function tokenize(text) {
  const s = String(text ?? '');
  const out = [];
  const re = /\S+|\s+/g;
  let i = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const t = m[0];
    const start = m.index;
    const end = start + t.length;
    if (/\s/.test(t[0])) out.push({ w: 'space', text: t, start, end });
    else out.push({ w: 'word', text: t, start, end, i: i++ });
  }
  return out;
}

const wordsOf = (text) => tokenize(text).filter((t) => t.w === 'word');

// המילה שבה נמצא הסמן — כולל סמן שצמוד לסוף המילה (start ≤ offset ≤ end) —
// ואחרת המילה הבאה; אחרי המילה האחרונה — האחרונה. בלי מילים: -1.
export function wordAt(text, offset) {
  const s = String(text ?? '');
  const ws = wordsOf(s);
  if (!ws.length) return -1;
  const o = clampOffset(offset, s);
  for (const w of ws) if (o <= w.end) return w.i;
  return ws[ws.length - 1].i;
}

// [lo, hi] של המילים שחופפות לטווח-התווים [a, b); null אם אין (או טווח ריק)
export function wordRange(text, a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (!(hi > lo)) return null;
  const hit = wordsOf(text).filter((w) => w.start < hi && lo < w.end);
  return hit.length ? [hit[0].i, hit[hit.length - 1].i] : null;
}

// ---------- יישור מילים אחרי עריכה ----------

// LCS על מילים (התאמה מדויקת) בתוך A[a0..a1) / B[b0..b1)
function lcsPairs(A, B, a0, a1, b0, b1) {
  const m = a1 - a0;
  const n = b1 - b0;
  if (m <= 0 || n <= 0) return [];
  const W = n + 1;
  const dp = new Uint16Array((m + 1) * W);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * W + j] = A[a0 + i] === B[b0 + j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (A[a0 + i] === B[b0 + j]) {
      pairs.push([a0 + i, b0 + j]);
      i++;
      j++;
    } else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
    else j++;
  }
  return pairs;
}

// מיקומי-תווים של מילים ברצף (מופרדות ברווח יחיד), לשיוך יחסי בתוך פער
function spans(arr, a, b) {
  const out = [];
  let pos = 0;
  for (let t = a; t < b; t++) {
    out.push([pos, pos + arr[t].length]);
    pos += arr[t].length + 1;
  }
  return { out, len: Math.max(1, pos - 1) };
}

// יישור words[] של שורה לטקסט החדש שלה, כדי שסגנונות-התו, הכתב והסימונים
// יישארו על המילים הנכונות גם כשמספר המילים משתנה.
// • עוגנים: LCS על המילים (טקסט זהה) — מילה שלא השתנתה שומרת את כל נתוניה.
// • בפער שבין שני עוגנים: מילה שהוחלפה (תיקון-אות) / פוצלה / אוחדה מקבלת את
//   נתוני המילה הישנה שבמקומה (סגנונות, כתב, תיבה) — אבל בלי conf, כי זו כבר
//   לא הקריאה של המכונה. אותו מספר מילים בפער = זוגות לפי המקום; אחרת — שיוך
//   יחסי לפי מיקום-התווים בפער.
// • מילה שנוספה (אין מולה מילה ישנה): {text, styles:[], script: של השכנה}.
// מחזיר {words, map, same, src}:
//   map[old] = המקום החדש של המילה הישנה (הראשון, אם פוצלה) או -1 אם נמחקה;
//   same[old] = true אם טקסט המילה לא השתנה (רק אז שומרים עליה סימוני-חשד);
//   src[new] = המילה הישנה שממנה נגזרה, או -1 למילה שנוספה.
export function realignWords(oldText, oldWords, newText) {
  const A = wordsOf(oldText).map((t) => t.text);
  const B = wordsOf(newText).map((t) => t.text);
  const m = A.length;
  const n = B.length;
  const map = new Array(m).fill(-1);
  const same = new Array(m).fill(false);
  const src = new Array(n).fill(-1);
  const match = (i, j) => {
    map[i] = j;
    same[i] = true;
    src[j] = i;
  };

  // קיצור: תחילית וסיומת משותפות (רוב העריכות נוגעות במקום אחד)
  let p = 0;
  while (p < m && p < n && A[p] === B[p]) {
    match(p, p);
    p++;
  }
  let s = 0;
  while (s < m - p && s < n - p && A[m - 1 - s] === B[n - 1 - s]) {
    match(m - 1 - s, n - 1 - s);
    s++;
  }
  for (const [i, j] of lcsPairs(A, B, p, m - s, p, n - s)) match(i, j);

  const pairGap = (o0, o1, n0, n1) => {
    const mo = o1 - o0;
    const mn = n1 - n0;
    if (mo <= 0 || mn <= 0) return;
    if (mo === mn) {
      for (let k = 0; k < mo; k++) {
        map[o0 + k] = n0 + k;
        src[n0 + k] = o0 + k;
      }
      return;
    }
    const so = spans(A, o0, o1);
    const sn = spans(B, n0, n1);
    for (let u = 0; u < mn; u++) {
      const [a, b] = sn.out[u];
      const c = ((a + b) / 2) * (so.len / sn.len);
      let best = 0;
      let bestD = Infinity;
      so.out.forEach(([x, y], t) => {
        const d = c < x ? x - c : c > y ? c - y : 0;
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      });
      src[n0 + u] = o0 + best;
      if (map[o0 + best] < 0) map[o0 + best] = n0 + u;
    }
  };

  let pi = -1;
  let pj = -1;
  for (let i = 0; i <= m; i++) {
    if (i < m && !same[i]) continue;
    const j = i < m ? map[i] : n;
    pairGap(pi + 1, i, pj + 1, j);
    pi = i;
    pj = j;
  }

  const old = Array.isArray(oldWords) ? oldWords : [];
  const words = B.map((text, j) => {
    const i = src[j];
    if (i < 0) return { text, styles: [], script: null };
    const w = old[i] && typeof old[i] === 'object' ? old[i] : {};
    return same[i] ? { ...w, text } : { ...w, text, conf: null };
  });
  // כתב למילה שנוספה: של המילה שלפניה, אחרת של הבאה, אחרת של השורה הישנה
  const fallback = old.find((w) => w?.script)?.script ?? null;
  for (let j = 0; j < n; j++) {
    if (src[j] >= 0) continue;
    let sc = j > 0 ? (words[j - 1].script ?? null) : null;
    for (let k = j + 1; sc == null && k < n; k++) if (src[k] >= 0) sc = words[k].script ?? null;
    words[j].script = sc ?? fallback;
  }
  return { words, map, same, src };
}

// ---------- לשוניות-הזרמים ----------

// שורת-כותרת: זרם *_heading או סגנון-פסקה h1/h2/h3
export const isHeadingLine = (line) => String(line?.stream || '').endsWith('_heading') || HEAD_STYLES.has(line?.para_style);

// הלשוניות לפי הזרמים שבעמוד: [{key, he, color, count, furniture}]. כותרת
// (*_heading) נספרת בזרם-הבסיס שלה; כל הריהוט (כותרת-עמוד, תחתית, מפריד) —
// לשונית אחת אחרונה. שורות שהוסרו אינן נספרות, וגם לא שורת-תוכן שמחוץ למסגרות
// (_outside — ops.markOutside: היא לא תיכנס לספר).
export function streamTabs(view) {
  const counts = new Map();
  const seen = [];
  let furniture = 0;
  for (const l of view?.lines || []) {
    if (!l || l.status === 'removed') continue;
    if (isFurnitureStream(l.stream)) {
      furniture++;
      continue;
    }
    if (l._outside) continue;
    const b = baseOf(l.stream);
    if (!counts.has(b)) {
      counts.set(b, 0);
      seen.push(b);
    }
    counts.set(b, counts.get(b) + 1);
  }
  const keys = [...CANON.filter((k) => counts.has(k)), ...seen.filter((k) => !CANON.includes(k))];
  const tabs = keys.map((key) => {
    const s = streamInfo(view, key);
    return { key, he: s.he, color: s.color, count: counts.get(key), furniture: false };
  });
  if (furniture) tabs.push({ key: FURNITURE_TAB, he: FURNITURE_TAB_HE, color: FURNITURE_COLOR, count: furniture, furniture: true });
  return tabs;
}

// שורות הלשונית בסדר-הקריאה (בלי שורות שהוסרו, ובלי שורות-תוכן שמחוץ למסגרות)
export function tabLines(view, tabKey) {
  const fur = tabKey === FURNITURE_TAB;
  return (view?.lines || [])
    .filter(
      (l) => l && l.status !== 'removed' && (fur ? isFurnitureStream(l.stream) : !isFurnitureStream(l.stream) && !l._outside && baseOf(l.stream) === tabKey)
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function nextLineInTab(lines, lineId) {
  const i = (lines || []).findIndex((l) => l.id === lineId);
  return i >= 0 && i + 1 < lines.length ? lines[i + 1] : null;
}

export function prevLineInTab(lines, lineId) {
  const i = (lines || []).findIndex((l) => l.id === lineId);
  return i > 0 ? lines[i - 1] : null;
}

// ---------- פסקאות ----------

// גבול שנכפה בין שתי שורות עוקבות בגלל הסגנון (בלי קשר ל-para_start):
// כותרת↔לא-כותרת, או מעבר לסגנון כותרת/ציטוט/ד"ה שונה מהקודם
function styleBreak(prev, cur) {
  if (isHeadingLine(prev) !== isHeadingLine(cur)) return true;
  return styleOf(prev) !== styleOf(cur) && FORCE_STYLES.has(styleOf(cur));
}

// מילים שמתחילות פסקה באמצע השורה (para_breaks תקפים בלבד, ממוינים)
function breaksOf(line, nWords) {
  return [...new Set((line?.para_breaks || []).filter((k) => Number.isInteger(k) && k >= 0 && k < nWords))].sort((a, b) => a - b);
}

// הפסקאות של הלשונית: [{key, lines:[{lineId, w0, w1, start, end}], style,
// heading, first:{lineId, w0}}]. פסקה מתחילה: בשורה הראשונה; בשורה עם
// para_start; במילה שב-para_breaks; כשמתחלפת "כותרתיות" השורה; וכשמתחלף
// סגנון-הפסקה לכותרת/ציטוט/ד"ה. w1 כולל; שורה ריקה = w0 0, w1 -1 (כדי שהסמן
// יוכל להיכנס אליה). start/end = טווח-התווים של הקטע בשורה (הקטע הראשון
// מתחיל ב-0, האחרון נגמר בסוף הטקסט; הרווח שבין שני קטעים של אותה שורה אינו
// שייך לאף אחד — הוא "גבול הפסקה"). בלשונית הריהוט כל שורה עומדת לבדה
// (כותרת-רצה, מספר-עמוד ומפריד אינם טקסט רציף).
export function buildParagraphs(view, tabKey) {
  const lines = tabLines(view, tabKey);
  const fur = tabKey === FURNITURE_TAB;
  const paras = [];
  let cur = null;
  const open = (line, w0) => {
    cur = { key: `${line.id}:${w0}`, lines: [], style: styleOf(line), heading: isHeadingLine(line), first: { lineId: line.id, w0 } };
    paras.push(cur);
  };
  lines.forEach((line, idx) => {
    const text = textOf(line);
    const ws = wordsOf(text);
    const n = ws.length;
    const prev = idx ? lines[idx - 1] : null;
    const cuts = breaksOf(line, n);
    const lineStart = fur || !prev || !!line.para_start || cuts[0] === 0 || styleBreak(prev, line);
    const starts = [0, ...cuts.filter((k) => k > 0)];
    starts.forEach((w0, s) => {
      const last = s + 1 >= starts.length;
      if (s > 0 || lineStart || !cur) open(line, w0);
      cur.lines.push({
        lineId: line.id,
        w0,
        w1: last ? n - 1 : starts[s + 1] - 1,
        start: s === 0 ? 0 : ws[w0].start,
        end: last ? text.length : ws[starts[s + 1] - 1].end,
      });
    });
  });
  return paras;
}

const startsOf = (view, tabKey) => new Set(buildParagraphs(view, tabKey).map((p) => `${p.first.lineId}:${p.first.w0}`));

// ---------- עוזרי-עריכה ----------

export function spliceText(text, start, end, insert = '') {
  const s = String(text ?? '');
  let a = clampOffset(start, s);
  let b = clampOffset(end, s);
  if (a > b) [a, b] = [b, a];
  const ins = String(insert ?? '');
  return { text: s.slice(0, a) + ins + s.slice(b), caret: a + ins.length };
}

function lineCtx(view, tabKey, pos) {
  if (tabKey === FURNITURE_TAB) return null;
  const lines = tabLines(view, tabKey);
  const idx = lines.findIndex((l) => l.id === pos?.lineId);
  if (idx < 0) return null;
  const line = lines[idx];
  const text = textOf(line);
  const ws = wordsOf(text);
  return {
    lines,
    idx,
    line,
    text,
    ws,
    off: clampOffset(pos.offset, text),
    // אין מילים — כל השורה היא "תחילתה" וגם "סופה"
    head: ws.length ? ws[0].start : text.length,
    tail: ws.length ? ws[ws.length - 1].end : 0,
  };
}

const noCtx = (tabKey) => ({ kind: 'noop', reason: tabKey === FURNITURE_TAB ? REASON.furniture : REASON.notInTab });

const isTemp = (line) => !(line?.id > 0) || !!line?._new;

function startDescriptor(view, tabKey, line, w) {
  if (isTemp(line)) return { kind: 'noop', reason: REASON.temp };
  if (startsOf(view, tabKey).has(`${line.id}:${w}`)) return { kind: 'noop', reason: REASON.already };
  if (w === 0) return { kind: 'para_start', lineId: line.id, value: 1 };
  if (w > MAX_BREAK_WORD) return { kind: 'noop', reason: REASON.tooLong };
  return { kind: 'para_break', lineId: line.id, word: w, on: true };
}

// Enter: פסקה חדשה במקום הסמן. בתחילת השורה ← para_start לשורה; בסוף השורה
// (או בתוך המילה האחרונה) ← para_start לשורה הבאה בלשונית; באמצע ← para_break
// מהמילה שמתחילה במקום הסמן או אחריו (Enter באמצע מילה אינו מפצל אותה).
export function enterAt(view, tabKey, pos) {
  const c = lineCtx(view, tabKey, pos);
  if (!c) return noCtx(tabKey);
  if (c.off <= c.head) return startDescriptor(view, tabKey, c.line, 0);
  const k = c.ws.findIndex((w) => w.start >= c.off);
  if (k > 0) return startDescriptor(view, tabKey, c.line, k);
  const next = c.lines[c.idx + 1];
  if (!next) return { kind: 'noop', reason: REASON.tabEnd };
  return startDescriptor(view, tabKey, next, 0);
}

// ביטול גבול-פסקה בין השורה prev לשורה line שמתחילה פסקה
function joinDescriptor(prev, line) {
  if (styleBreak(prev, line)) return { kind: 'noop', reason: REASON.style };
  if (isTemp(line)) return { kind: 'noop', reason: REASON.temp };
  return { kind: 'para_start', lineId: line.id, value: 0 };
}

// Backspace בתחילת שורה/פסקה. תחילת שורה שפותחת פסקה ← para_start 0; תחילת
// פסקה באמצע שורה ← para_break off; גבול רגיל בין שתי שורות של אותה פסקה ←
// {kind:'line-boundary'} (סוף-שורה בסריקה — אין מה למחוק); תחילת הלשונית ← noop.
export function backspaceAtStart(view, tabKey, pos) {
  const c = lineCtx(view, tabKey, pos);
  if (!c) return noCtx(tabKey);
  if (c.off <= c.head) {
    if (c.idx === 0) return { kind: 'noop', reason: REASON.tabStart };
    const prev = c.lines[c.idx - 1];
    if (!startsOf(view, tabKey).has(`${c.line.id}:0`)) return { kind: 'line-boundary', lineId: c.line.id, prevLineId: prev.id };
    return joinDescriptor(prev, c.line);
  }
  const k = breaksOf(c.line, c.ws.length).find((b) => b > 0 && c.ws[b - 1].end < c.off && c.off <= c.ws[b].start);
  if (k !== undefined) return { kind: 'para_break', lineId: c.line.id, word: k, on: false };
  return { kind: 'noop', reason: REASON.notAtBoundary };
}

// Delete בסוף שורה/פסקה — המראה של backspaceAtStart
export function deleteAtEnd(view, tabKey, pos) {
  const c = lineCtx(view, tabKey, pos);
  if (!c) return noCtx(tabKey);
  if (c.off >= c.tail) {
    const next = c.lines[c.idx + 1];
    if (!next) return { kind: 'noop', reason: REASON.tabEnd };
    if (!startsOf(view, tabKey).has(`${next.id}:0`)) return { kind: 'line-boundary', lineId: c.line.id, nextLineId: next.id };
    return joinDescriptor(c.line, next);
  }
  const k = breaksOf(c.line, c.ws.length).find((b) => b > 0 && c.ws[b - 1].end <= c.off && c.off < c.ws[b].start);
  if (k !== undefined) return { kind: 'para_break', lineId: c.line.id, word: k, on: false };
  return { kind: 'noop', reason: REASON.notAtBoundary };
}

// בחירה בין שני מקומות-סמן ← טווח לכל שורה, בסדר-הקריאה (גם שורות שהטווח
// בהן ריק — כדי שהמשתמש ידע אילו גבולות-שורה נחצו)
export function selectionToLineRanges(view, tabKey, a, b) {
  const lines = tabLines(view, tabKey);
  const ia = lines.findIndex((l) => l.id === a?.lineId);
  const ib = lines.findIndex((l) => l.id === b?.lineId);
  if (ia < 0 || ib < 0) return [];
  let p = { i: ia, o: clampOffset(a.offset, textOf(lines[ia])) };
  let q = { i: ib, o: clampOffset(b.offset, textOf(lines[ib])) };
  if (p.i > q.i || (p.i === q.i && p.o > q.o)) [p, q] = [q, p];
  const out = [];
  for (let i = p.i; i <= q.i; i++) {
    out.push({ lineId: lines[i].id, start: i === p.i ? p.o : 0, end: i === q.i ? q.o : textOf(lines[i]).length });
  }
  return out;
}

// גבולות-הפסקה שבחירה (a..b) חוצה — מה שמחיקת הבחירה מאחדת: para_start 0
// לפסקה שמתחילה בתחילת שורה, para_break off לפסקה שמתחילה באמצע שורה. גבול
// שנכפה בסגנון (כותרת/ציטוט/ד"ה) או בשורה זמנית אינו נכלל. בחירה שמתחילה
// בדיוק בתחילת פסקה אינה חוצה אותה. יש לשלוח את הפעולות האלה *לפני* תיקוני-
// הטקסט — מספר-המילה של para_break מתייחס לטקסט הנוכחי.
export function joinsInRange(view, tabKey, a, b) {
  if (tabKey === FURNITURE_TAB) return [];
  const lines = tabLines(view, tabKey);
  const idx = new Map(lines.map((l, i) => [l.id, i]));
  if (!idx.has(a?.lineId) || !idx.has(b?.lineId)) return [];
  const at = (p) => {
    const i = idx.get(p.lineId);
    return [i, clampOffset(p.offset, textOf(lines[i]))];
  };
  const cmp = (x, y) => x[0] - y[0] || x[1] - y[1];
  let p = at(a);
  let q = at(b);
  if (cmp(p, q) > 0) [p, q] = [q, p];
  const out = [];
  for (const para of buildParagraphs(view, tabKey)) {
    const { lineId, w0 } = para.first;
    const i = idx.get(lineId);
    if (i === 0 && w0 === 0) continue;
    const start = [i, w0 === 0 ? 0 : wordsOf(textOf(lines[i]))[w0].start];
    if (!(cmp(p, start) < 0 && cmp(start, q) <= 0)) continue;
    if (w0 > 0) out.push({ kind: 'para_break', lineId, word: w0, on: false });
    else {
      const d = joinDescriptor(lines[i - 1], lines[i]);
      if (d.kind !== 'noop') out.push(d);
    }
  }
  return out;
}

// תיאור מעוזרי-העריכה ← פעולת-חוזה (null ל-noop/line-boundary)
export function descriptorToOp(desc, page) {
  if (desc?.kind === 'para_start') return { kind: 'para_start', page, ids: [desc.lineId], value: desc.value ? 1 : 0 };
  if (desc?.kind === 'para_break') return { kind: 'para_break', page, ids: [desc.lineId], value: { word: desc.word, on: !!desc.on } };
  return null;
}

// ---------- אישור פסקה-פסקה ----------
//
// המתנדב מאשר את הטקסט פסקה אחרי פסקה. אישור = line_ok לשורות הפסקה (אות-
// אימון: "הטקסט הנוכחי של השורה נכון"). שורה שמתחלקת בין שתי פסקאות (פסקה
// שמתחילה באמצע שורה) נחשבת מאושרת רק כששתיהן אושרו — ה-line_ok שלה נשלח עם
// אישור הפסקה השנייה. את "חצי-האישור" של שורה כזו שומר העורך כפעולה מקומית
// (SEG_OK, עם _local: true) שאינה יוצאת מהדפדפן: useProofEditor לא מחזיר
// אותה ב-ops (ולא בהגשה), ורק מסמן בתצוגה אילו קטעים אושרו (view._segOk).

export const SEG_OK = 'seg_ok';

// מפתח של קטע-שורה בפסקה: "<מזהה-שורה>:<המילה שהקטע מתחיל בה>" — לקטע שפותח
// פסקה זהו גם מפתח הפסקה (buildParagraphs)
export const segKey = (lineId, w0) => `${lineId}:${w0}`;

// הגבול שהיה במילה b אחרי תיקון-טקסט: המקום החדש של המילה, ואם נמחקה — של
// המילה ששרדה אחריה (אותו כלל של para_breaks ב-ops.applyText). -1 = אין.
function survivorOf(b, map) {
  for (let t = b; t < map.length; t++) if (map[t] >= 0) return map[t];
  return -1;
}

// אילו קטעי-שורה אושרו בחצי-אישור (פעולות SEG_OK מקומיות), במפתחות של הטקסט
// *הנוכחי*: מילת-ההתחלה של קטע זזה עם תיקוני-טקסט מאוחרים באותה שורה (כמו
// para_breaks), כך שתיקון מילה לפני הגבול לא "מבטל" את האישור של הפסקה שאחריו.
// מחזיר {keys: Set<מפתח>, byOp: Map<הפעולה, המפתח הנוכחי שלה>} — byOp כדי
// שביטול-אישור ימצא את הפעולות גם אחרי שהמפתח שלהן זז.
export function segOkState(baseDoc, ops) {
  const text = new Map((baseDoc?.lines || []).map((l) => [l?.id, String(l?.text ?? l?.text_ocr ?? '')]));
  const active = new Map();
  for (const op of ops || []) {
    if (!op || typeof op !== 'object') continue;
    const id = Array.isArray(op.ids) ? op.ids[0] : undefined;
    if (op.kind === SEG_OK) {
      if (Number.isInteger(id) && Number.isInteger(op.value) && op.value >= 0) {
        if (!active.has(id)) active.set(id, []);
        active.get(id).push({ op, w0: op.value });
      }
      continue;
    }
    if (op._local) continue;
    if (op.kind === 'text' && typeof op.value === 'string' && Number.isInteger(id)) {
      const marks = active.get(id);
      if (marks?.length) {
        const { map } = realignWords(text.get(id) ?? '', null, op.value);
        active.set(
          id,
          marks.map((m) => ({ op: m.op, w0: m.w0 === 0 ? 0 : survivorOf(m.w0, map) })).filter((m) => m.w0 >= 0)
        );
      }
      text.set(id, op.value);
    } else if (op.kind === 'line_split' || op.kind === 'line_merge') {
      // השורה המקורית כבר איננה בתצוגה — גם חצאי-האישור שלה
      for (const x of op.ids || []) active.delete(x);
    }
  }
  const keys = new Set();
  const byOp = new Map();
  for (const [id, list] of active) {
    for (const m of list) {
      const k = segKey(id, m.w0);
      keys.add(k);
      byOp.set(m.op, k);
    }
  }
  return { keys, byOp };
}

// שורה שהטקסט שלה נעול: זמנית (נוצרה בתיקון-חיתוך), ממתינה לחיתוך ולזיהוי-
// מחדש (_recut), או ברשימת locked שהעורך מעביר (recutLineIds)
export function isLockedLine(line, locked = null) {
  if (!line || !(line.id > 0) || line._new || line._recut) return true;
  return !!(locked && typeof locked.has === 'function' && locked.has(line.id));
}

const asSet = (x) => (x instanceof Set ? x : new Set(Array.isArray(x) ? x : []));

// מצב-האישור של הפסקאות בלשונית:
// {byKey: Map(מפתח-פסקה → {approved, approvable, pre, lineIds, segs}),
//  segsByLine: Map(מזהה-שורה → [מפתחות-הקטעים שלה]), approved, total}.
// • segs = [{lineId, w0, key, shared, locked, pre, ok}] — shared = השורה מתחלקת
//   בין כמה פסקאות; pre = השורה אושרה כבר לפני ההגהה הזו; ok = השורה אושרה
//   (_ok), אושרה קודם (pre), או — לשורה משותפת — הקטע הזה אושר.
// • lineIds = השורות שאפשר לאשר בפסקה (לא נעולות), בסדר-הקריאה.
// • pre (של הפסקה) = מאושרת רק בזכות אישור קודם — אין כאן מה לבטל.
// • פסקה שכל שורותיה נעולות אינה ניתנת לאישור (approvable=false) ואינה נספרת.
// • ריהוט הדף אינו טקסט של הספר — אין בו פסקאות לאישור (byKey ריק).
// opts.locked = Set של מזהי-שורות נעולות נוספות (recutLineIds);
// opts.preApproved (ואחרת view._preOk) = שורות שאושרו כבר לפני ההגהה הזו —
// במעבר שני: status ok/fixed בעמוד שיובא, בלי recheck (useProofEditor).
export function paragraphApproval(view, tabKey, opts = {}) {
  if (tabKey === FURNITURE_TAB) return { byKey: new Map(), segsByLine: new Map(), approved: 0, total: 0 };
  const locked = opts?.locked || null;
  const segOk = asSet(view?._segOk);
  const pre = asSet(opts?.preApproved ?? view?._preOk);
  const paras = buildParagraphs(view, tabKey);
  const byId = new Map(tabLines(view, tabKey).map((l) => [l.id, l]));
  const count = new Map();
  for (const p of paras) for (const s of p.lines) count.set(s.lineId, (count.get(s.lineId) || 0) + 1);

  const byKey = new Map();
  const segsByLine = new Map();
  let approved = 0;
  let total = 0;
  for (const p of paras) {
    const segs = [];
    const lineIds = [];
    for (const s of p.lines) {
      const line = byId.get(s.lineId);
      const key = segKey(s.lineId, s.w0);
      const shared = count.get(s.lineId) > 1;
      const isLocked = isLockedLine(line, locked);
      const isPre = pre.has(s.lineId);
      const ok = !!line?._ok || isPre || (shared && segOk.has(key));
      segs.push({ lineId: s.lineId, w0: s.w0, key, shared, locked: isLocked, pre: isPre, ok });
      if (!segsByLine.has(s.lineId)) segsByLine.set(s.lineId, []);
      segsByLine.get(s.lineId).push(key);
      if (!isLocked && !lineIds.includes(s.lineId)) lineIds.push(s.lineId);
    }
    const live = segs.filter((s) => !s.locked);
    const approvable = live.length > 0;
    const isApproved = approvable && live.every((s) => s.ok);
    if (approvable) {
      total++;
      if (isApproved) approved++;
    }
    byKey.set(p.key, { approved: isApproved, approvable, pre: isApproved && live.every((s) => s.pre), lineIds, segs });
  }
  return { byKey, segsByLine, approved, total };
}

// סיכום לכל העמוד: כל לשוניות-התוכן (בלי ריהוט הדף) —
// {approved, total, byTab: Map(מפתח-לשונית → {approved, total})}.
// זה המספר שחלון-ההגשה ושורת-המצב מציגים ("אושרו 5 מתוך 12 פסקאות").
export function pageApproval(view, opts = {}) {
  const byTab = new Map();
  let approved = 0;
  let total = 0;
  for (const t of streamTabs(view)) {
    if (t.furniture) continue;
    const a = paragraphApproval(view, t.key, opts);
    byTab.set(t.key, { approved: a.approved, total: a.total });
    approved += a.approved;
    total += a.total;
  }
  return { approved, total, byTab };
}

// ---------- גרסת-העמוד ----------

// מזהה-גרסה לעמוד (למפתח-הטיוטה): revision + גיבוב של מזהי-השורות והגודל.
// עמוד שחזר מזיהוי-מחדש (revision+1, שורות אחרות) לא ישחזר טיוטה של הקודם.
export function docRevision(doc) {
  const ids = (doc?.lines || [])
    .map((l) => l?.id)
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  const size = Array.isArray(doc?.size) ? doc.size.join('x') : '';
  return `${doc?.revision ?? 1}:${hash32(`${ids.join(',')}|${size}`).toString(16).padStart(8, '0')}`;
}
