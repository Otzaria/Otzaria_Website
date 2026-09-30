// עריכת הטקסט הזורם — החלק הטהור של FlowEditor: לאילו פעולות-חוזה הופכת כל
// פעולה של המתנדב (הקלדה, מחיקה, Enter, עיצוב, אישור פסקה…), ולאן עובר הסמן.
// בלי DOM: העורך ממפה את הבחירה בדפדפן למקומות-סמן וקורא לכאן.
//
// מקום = {lineId, offset} — היסט-תווים בטקסט הנוכחי של השורה (textModel).
// בחירה = {anchor, focus}; כששניהם שווים — סמן.
// כל פונקציית-תכנון מחזירה {ops, caret?, sel?, hint?, coalesceKey?}:
//   ops         — נשלחות ב-push אחד (כמה פעולות = קבוצת-Undo אחת); ריק = כלום;
//   caret / sel — מקום הסמן / הבחירה אחרי שהפעולות יוחלו;
//   hint        — הסבר קצר בעברית למתנדב (למשל "זה סוף-שורה בסריקה");
//   coalesceKey — הקלדה רצופה באותה שורה מתאחדת לפעולה אחת (useProofEditor).

import {
  tokenize,
  wordRange,
  wordAt,
  tabLines,
  buildParagraphs,
  spliceText,
  enterAt,
  backspaceAtStart,
  deleteAtEnd,
  selectionToLineRanges,
  joinsInRange,
  descriptorToOp,
  paragraphApproval,
  isLockedLine,
  segKey,
  SEG_OK,
  FURNITURE_TAB,
} from './textModel.js';

export const HINTS = Object.freeze({
  locked: 'השורה ממתינה לזיהוי מחדש — אין טעם להקליד בה',
  lockedSkipped: 'שורות שממתינות לזיהוי מחדש לא שונו',
  lineBoundary: 'זה סוף-שורה בסריקה — אי אפשר למחוק אותו כאן',
  noWord: 'הסמן אינו על מילה — בחרו מילה או הציבו עליה את הסמן',
  firstPara: 'זו הפסקה הראשונה בזרם — אין לפניה פסקה לחבר אליה',
  furniture: 'ריהוט הדף אינו מחולק לפסקאות',
  furnitureApprove: 'ריהוט הדף (כותרת-רצה, מספר עמוד) אינו נכנס לספר — אין בו פסקאות לאישור',
  notApprovable: 'השורות בפסקה הזו ממתינות לזיהוי מחדש — אין בה מה לאשר',
  emptied: 'השורה ריקה עכשיו — אם במקום הזה בסריקה יש קישוט או כתם ולא טקסט, לחצו "לא-שורה" שליד השורה',
  allApproved: 'כל הפסקאות בזרם אושרו',
  wrapApprove: 'חזרה לפסקה הראשונה בזרם שעוד לא אושרה',
  noSuspicious: 'אין בזרם הזה מילים מסומנות',
  wrapNext: 'הגעתם לסוף הזרם — חזרה לתחילתו',
  wrapPrev: 'הגעתם לתחילת הזרם — חזרה לסופו',
});

const EMPTY = Object.freeze({ ops: [] });
const HEAD_STYLES = new Set(['h1', 'h2', 'h3']);

const textOf = (l) => String(l?.text ?? '');
const wordsOf = (text) => tokenize(text).filter((t) => t.w === 'word');
const clamp = (n, lo, hi) => Math.max(lo, Math.min(Number.isFinite(n) ? Math.trunc(n) : 0, hi));
const textOp = (page, lineId, value) => ({ kind: 'text', page, ids: [lineId], value });

export const samePos = (a, b) => !!a && !!b && a.lineId === b.lineId && a.offset === b.offset;
export const isCollapsed = (sel) => !sel?.anchor || !sel?.focus || samePos(sel.anchor, sel.focus);

function ctx(view, tabKey) {
  const lines = tabLines(view, tabKey);
  return {
    lines,
    idx: new Map(lines.map((l, i) => [l.id, i])),
    byId: new Map(lines.map((l) => [l.id, l])),
    page: view?.page,
  };
}

// שני מקומות בסדר-הקריאה של הלשונית
function ordered(c, a, b) {
  const ia = c.idx.get(a?.lineId) ?? -1;
  const ib = c.idx.get(b?.lineId) ?? -1;
  return ia < ib || (ia === ib && (a?.offset ?? 0) <= (b?.offset ?? 0)) ? [a, b] : [b, a];
}

// טקסט שמודבק או מוקלד: ירידות-שורה וטאבים ← רווח; סימני-כיווניות, רווחים
// ברוחב-אפס ותווי-בקרה — נמחקים (שורה בספר היא שורה אחת של טקסט רגיל)
const INVISIBLE_RE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const isControl = (ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f;

export function cleanInsert(s) {
  const flat = String(s ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/\t/g, ' ')
    .replace(INVISIBLE_RE, '');
  return Array.from(flat)
    .filter((ch) => !isControl(ch))
    .join('');
}

// ---------- מילים ----------

// המילה שהמקום בתוכה או צמוד לה (start ≤ offset ≤ end); -1 אם הסמן ברווח
export function wordIndexAt(text, offset) {
  for (const w of wordsOf(text)) if (offset >= w.start && offset <= w.end) return w.i;
  return -1;
}

// סימוני-החשד של מילות השורה (כמו view.wordTokens): ביטחון-זיהוי נמוך,
// חלופות-זיהוי, וחשד של מודל-השפה (lm = סגול, rec = כתום)
export function wordMarks(line, lowWord = 0.95) {
  const low = new Set((line?.flags?.low_words || []).filter(Number.isInteger));
  (line?.words || []).forEach((w, i) => {
    if (typeof w?.conf === 'number' && w.conf < lowWord) low.add(i);
  });
  const alts = new Map();
  for (const a of line?.alternatives || []) if (a && Number.isInteger(a.i)) alts.set(a.i, a);
  const lm = new Map();
  for (const f of line?.lm_flags || []) if (f && Number.isInteger(f.i)) lm.set(f.i, f);
  return { low, alts, lm };
}

const lowWordOf = (view) => (typeof view?.low_word === 'number' ? view.low_word : 0.95);

// מילות-הדיבור-המתחיל לתצוגה בפסקת ד"ה: מתחילת הפסקה ועד המילה הראשונה
// שנגמרת בנקודה/נקודתיים/סוף-פסוק (או שאחריה מקף), עד max מילים; בלי סימן
// כזה — המילה הראשונה בלבד. [lo, hi] או null.
export function lemmaWords(text, w0 = 0, max = 8) {
  const ws = wordsOf(text);
  if (w0 >= ws.length) return null;
  for (let i = w0; i < ws.length && i < w0 + max; i++) {
    if (/[.:׃]$/.test(ws[i].text) || /^[—–-]$/.test(ws[i + 1]?.text || '')) return [w0, i];
  }
  return [w0, w0];
}

// ---------- מבנה ----------

// הפסקה שהמקום בתוכה (אינדקס ב-paras); -1 אם השורה אינה בלשונית
export function paragraphIndexAt(paras, pos) {
  if (!pos) return -1;
  let last = -1;
  for (let i = 0; i < (paras || []).length; i++) {
    for (const s of paras[i].lines) {
      if (s.lineId !== pos.lineId) continue;
      if (pos.offset <= s.end) return i;
      last = i;
    }
  }
  return last;
}

// מקום תחילת הפסקה (קטע-השורה הראשון שלה)
export const paragraphStart = (para) => (para?.lines?.[0] ? { lineId: para.lines[0].lineId, offset: para.lines[0].start } : null);

// מה יש בסמן — לסרגל-הכלים: {paraKey, paraStyle, heading, lineId, wordIndex,
// charStyles: Set}
export function caretInfo(view, tabKey, pos) {
  const paras = buildParagraphs(view, tabKey);
  const pi = paragraphIndexAt(paras, pos);
  const line = tabLines(view, tabKey).find((l) => l.id === pos?.lineId) || null;
  const wordIndex = line ? wordIndexAt(textOf(line), pos.offset) : -1;
  return {
    paraKey: pi >= 0 ? paras[pi].key : null,
    paraStyle: pi >= 0 ? paras[pi].style : null,
    heading: pi >= 0 ? paras[pi].heading : false,
    lineId: line ? line.id : null,
    wordIndex,
    charStyles: new Set(wordIndex >= 0 ? line?.words?.[wordIndex]?.styles || [] : []),
  };
}

// ---------- טקסט ----------

// שורה שהתרוקנה בעריכה (היה בה טקסט ועכשיו אין) — רמז: אולי זה קישוט/כתם
const emptiedBy = (before, after) => before !== '' && after === '';
const joinHints = (...hints) => hints.filter(Boolean).join(' · ') || undefined;

// תיקון-טקסט על טווח (אולי כמה שורות) + הכנסת str בתחילתו. גבולות-פסקה שהטווח
// חוצה מתבטלים (לפני תיקוני-הטקסט — מספרי-המילים שלהם מתייחסים לטקסט הנוכחי).
function rangeEdit(view, tabKey, c, sel, str, opts) {
  const [p, q] = ordered(c, sel.anchor, sel.focus);
  if (!c.byId.has(p?.lineId) || !c.byId.has(q?.lineId)) return EMPTY;
  const ranges = selectionToLineRanges(view, tabKey, p, q);
  // ההכנסה נכנסת לשורה הראשונה של הבחירה; כשהיא נעולה — לא מוחקים כלום (אחרת
  // שאר הבחירה נמחקת והאות שהוקלדה הולכת לאיבוד)
  if (str && ranges.length && isLockedLine(c.byId.get(ranges[0].lineId), opts?.locked)) return { ops: [], hint: HINTS.locked };
  const joins = joinsInRange(view, tabKey, p, q)
    .map((d) => descriptorToOp(d, c.page))
    .filter(Boolean);
  const edits = [];
  let skipped = false;
  let emptied = false;
  let caret = { lineId: p.lineId, offset: p.offset };
  ranges.forEach((r, k) => {
    const line = c.byId.get(r.lineId);
    const ins = k === 0 ? str : '';
    if (r.start === r.end && !ins) return;
    if (isLockedLine(line, opts?.locked)) {
      skipped = true;
      return;
    }
    const before = textOf(line);
    const next = spliceText(before, r.start, r.end, ins);
    if (k === 0) caret = { lineId: line.id, offset: next.caret };
    if (next.text !== before) edits.push(textOp(c.page, line.id, next.text));
    if (emptiedBy(before, next.text)) emptied = true;
  });
  const res = { ops: [...joins, ...edits], caret };
  const hint = joinHints(skipped && HINTS.lockedSkipped, emptied && HINTS.emptied);
  if (hint) res.hint = hint;
  // החלפת בחירה בתוך שורה אחת (למשל מילה מסומנת והקלדה עליה) — חלק מהצבירה
  if (!joins.length && edits.length === 1 && ranges.length === 1) res.coalesceKey = `text:${p.lineId}`;
  return res;
}

// הקלדה / הדבקה / החלפה (insertText, insertFromPaste, insertReplacementText).
// הדבקה של "כלום" (לוח-גזירים של תמונה, רק סימני-כיווניות) אינה מוחקת את הבחירה.
export function planInsert(view, tabKey, sel, raw, opts = {}) {
  if (!sel?.focus) return EMPTY;
  const str = cleanInsert(raw);
  if (!str) return EMPTY;
  const c = ctx(view, tabKey);
  if (!isCollapsed(sel)) return rangeEdit(view, tabKey, c, sel, str, opts);
  const line = c.byId.get(sel.focus.lineId);
  if (!line) return EMPTY;
  if (isLockedLine(line, opts.locked)) return { ops: [], hint: HINTS.locked };
  const r = spliceText(textOf(line), sel.focus.offset, sel.focus.offset, str);
  return { ops: [textOp(c.page, line.id, r.text)], caret: { lineId: line.id, offset: r.caret }, coalesceKey: `text:${line.id}` };
}

// גבולות-מחיקה בתוך שורה כשהדפדפן לא מסר טווח (getTargetRanges)
function prevGrapheme(text, off) {
  if (off <= 0) return 0;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    let last = 0;
    for (const s of new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(text)) {
      if (s.index >= off) break;
      last = s.index;
    }
    return last;
  }
  const lowSurrogate = text.charCodeAt(off - 1) >= 0xdc00 && text.charCodeAt(off - 1) <= 0xdfff;
  return off - (lowSurrogate && off >= 2 ? 2 : 1);
}

function nextGrapheme(text, off) {
  if (off >= text.length) return text.length;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    for (const s of new Intl.Segmenter('he', { granularity: 'grapheme' }).segment(text)) {
      if (s.index > off) return s.index;
    }
    return text.length;
  }
  const highSurrogate = text.charCodeAt(off) >= 0xd800 && text.charCodeAt(off) <= 0xdbff;
  return off + (highSurrogate && off + 1 < text.length ? 2 : 1);
}

function fallbackRange(text, off, dir, unit) {
  const isSpace = (ch) => /\s/.test(ch);
  if (unit === 'line') return dir < 0 ? [0, off] : [off, text.length];
  if (unit === 'word') {
    let i = off;
    if (dir < 0) {
      while (i > 0 && isSpace(text[i - 1])) i--;
      while (i > 0 && !isSpace(text[i - 1])) i--;
      return [i, off];
    }
    while (i < text.length && isSpace(text[i])) i++;
    while (i < text.length && !isSpace(text[i])) i++;
    return [off, i];
  }
  return dir < 0 ? [prevGrapheme(text, off), off] : [off, nextGrapheme(text, off)];
}

function validBreaks(line, n) {
  return [...new Set((line?.para_breaks || []).filter((k) => Number.isInteger(k) && k > 0 && k < n))].sort((a, b) => a - b);
}

// תוצאה של עוזר-עריכה בגבול שורה/פסקה (textModel) ← תוכנית
function boundary(c, d, dir, pos) {
  if (d?.kind === 'para_start' || d?.kind === 'para_break') {
    const op = descriptorToOp(d, c.page);
    return { ops: op ? [op] : [], caret: pos };
  }
  if (d?.kind === 'line-boundary') {
    // אין מה למחוק — הסמן "מדלג" מעל סוף-השורה, כדי שהמחיקה הבאה תמשיך
    if (dir < 0) {
      const prev = c.byId.get(d.prevLineId);
      return { ops: [], caret: prev ? { lineId: prev.id, offset: textOf(prev).length } : pos, hint: HINTS.lineBoundary };
    }
    const next = c.byId.get(d.nextLineId);
    return { ops: [], caret: next ? { lineId: next.id, offset: 0 } : pos, hint: HINTS.lineBoundary };
  }
  return { ops: [], hint: d?.reason || null };
}

// Backspace (dir=-1) / Delete (dir=1). unit: 'char' | 'word' | 'line'.
// target = {start, end} — הטווח שהדפדפן חישב (אותיות מורכבות, גבולות-מילה
// בדו-כיווניות); משמש רק כששני קצותיו באותה שורה של הסמן.
// בתחילת שורה/פסקה (או בסופה, ל-Delete) — משמעות-הפסקאות של textModel.
export function planDelete(view, tabKey, sel, dir, unit = 'char', target = null, opts = {}) {
  if (!sel?.focus) return EMPTY;
  const c = ctx(view, tabKey);
  if (!isCollapsed(sel)) return rangeEdit(view, tabKey, c, sel, '', opts);
  const line = c.byId.get(sel.focus.lineId);
  if (!line) return EMPTY;
  const text = textOf(line);
  const ws = wordsOf(text);
  const off = clamp(sel.focus.offset, 0, text.length);
  const pos = { lineId: line.id, offset: off };
  const breaks = validBreaks(line, ws.length);
  if (dir < 0) {
    const head = ws.length ? ws[0].start : text.length;
    if (off <= head || breaks.some((b) => ws[b - 1].end < off && off <= ws[b].start)) {
      return boundary(c, backspaceAtStart(view, tabKey, pos), dir, pos);
    }
  } else {
    const tail = ws.length ? ws[ws.length - 1].end : 0;
    if (off >= tail || breaks.some((b) => ws[b - 1].end <= off && off < ws[b].start)) {
      return boundary(c, deleteAtEnd(view, tabKey, pos), dir, pos);
    }
  }
  if (isLockedLine(line, opts.locked)) return { ops: [], hint: HINTS.locked };
  let a;
  let b;
  const t = target;
  if (t?.start?.lineId === line.id && t?.end?.lineId === line.id && t.start.offset !== t.end.offset) {
    a = clamp(Math.min(t.start.offset, t.end.offset), 0, text.length);
    b = clamp(Math.max(t.start.offset, t.end.offset), 0, text.length);
  } else {
    [a, b] = fallbackRange(text, off, dir, unit);
  }
  if (a === b) return EMPTY;
  const r = spliceText(text, a, b, '');
  const res = { ops: [textOp(c.page, line.id, r.text)], caret: { lineId: line.id, offset: a }, coalesceKey: `text:${line.id}` };
  if (emptiedBy(text, r.text)) res.hint = HINTS.emptied;
  return res;
}

// ---------- פסקאות ----------

// Enter: פסקה חדשה במקום הסמן (בבחירה — בתחילתה; הטקסט הנבחר אינו נמחק)
export function planEnter(view, tabKey, sel) {
  if (!sel?.focus) return EMPTY;
  const c = ctx(view, tabKey);
  const pos = isCollapsed(sel) ? sel.focus : ordered(c, sel.anchor, sel.focus)[0];
  const d = enterAt(view, tabKey, pos);
  if (d.kind === 'noop') return { ops: [], hint: d.reason };
  const op = descriptorToOp(d, c.page);
  if (d.kind === 'para_break') {
    const w = wordsOf(textOf(c.byId.get(d.lineId)))[d.word];
    return { ops: [op], caret: { lineId: d.lineId, offset: w ? w.start : pos.offset } };
  }
  return { ops: [op], caret: { lineId: d.lineId, offset: 0 } };
}

// "חיבור פסקאות" בסרגל: הפסקה של הסמן מתחברת לזו שלפניה
export function planJoin(view, tabKey, pos) {
  if (tabKey === FURNITURE_TAB) return { ops: [], hint: HINTS.furniture };
  const c = ctx(view, tabKey);
  const paras = buildParagraphs(view, tabKey);
  const i = paragraphIndexAt(paras, pos);
  if (i < 0) return EMPTY;
  if (i === 0) return { ops: [], hint: HINTS.firstPara };
  const start = paragraphStart(paras[i]);
  return boundary(c, backspaceAtStart(view, tabKey, start), -1, pos);
}

// "חיבור לפסקה הקודמת" לפסקה לפי המפתח שלה (הכפתור שליד הפסקה, התפריט "סגנון פסקה") —
// בדיוק כמו Backspace בתחילתה (planJoin מתחילת הפסקה)
export function planJoinPara(view, tabKey, key) {
  const p = buildParagraphs(view, tabKey).find((x) => x.key === key);
  const start = paragraphStart(p);
  return start ? planJoin(view, tabKey, start) : EMPTY;
}

// סגנון-פסקה לכל שורות הפסקאות שהבחירה/הסמן נוגעים בהן — פעולה אחת. סגנון
// שאינו כותרת על שורה שזרמה *_heading מוריד גם את ה-_heading (אחרת היא
// נשארת כותרת).
export function planParaStyle(view, tabKey, sel, style) {
  if (!sel?.focus) return EMPTY;
  if (tabKey === FURNITURE_TAB) return { ops: [], hint: HINTS.furniture };
  const c = ctx(view, tabKey);
  const paras = buildParagraphs(view, tabKey);
  const [p, q] = isCollapsed(sel) ? [sel.focus, sel.focus] : ordered(c, sel.anchor, sel.focus);
  const i0 = paragraphIndexAt(paras, p);
  const i1 = paragraphIndexAt(paras, q);
  if (i0 < 0 || i1 < 0) return EMPTY;
  const ids = [];
  for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) {
    for (const s of paras[i].lines) {
      const l = c.byId.get(s.lineId);
      if (l && l.id > 0 && !l._new && !ids.includes(l.id)) ids.push(l.id);
    }
  }
  if (!ids.length) return { ops: [], hint: HINTS.locked };
  const ops = [{ kind: 'para', page: c.page, ids, value: style }];
  if (!HEAD_STYLES.has(style)) {
    const byBase = new Map();
    for (const id of ids) {
      const s = String(c.byId.get(id).stream || '');
      if (!s.endsWith('_heading')) continue;
      const base = s.slice(0, -'_heading'.length);
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(id);
    }
    for (const [base, list] of byBase) ops.push({ kind: 'stream', page: c.page, ids: list, value: base });
  }
  return { ops, sel };
}

// ---------- סגנון-תו ----------

// סגנונות שנראים (ויוצאים באוצריא) כמו סגנון אחר: heavy — ההדגשה שגלאי-
// הטיפוגרפיה מצא — הוא <b> כמו b. B מוצג לחוץ גם עליו, ו-B כבוי מוריד את שניהם.
export const STYLE_ALIASES = Object.freeze({ b: Object.freeze(['heavy']) });
const namesOf = (style) => [style, ...(STYLE_ALIASES[style] || [])];

const hasStyle = (line, lo, hi, style) => {
  const names = namesOf(style);
  for (let i = lo; i <= hi; i++) {
    const s = line?.words?.[i]?.styles || [];
    if (!names.some((n) => s.includes(n))) return false;
  }
  return true;
};

const anyStyle = (line, lo, hi, name) => {
  for (let i = lo; i <= hi; i++) if ((line?.words?.[i]?.styles || []).includes(name)) return true;
  return false;
};

// האם סגנון-התו "פועל" על המילה (לסרגל: הכפתור לחוץ) — כולל הכינויים (b ← heavy)
export const styleActive = (styles, style) => {
  const s = styles instanceof Set ? styles : new Set(styles || []);
  return namesOf(style).some((n) => s.has(n));
};

// סגנון-תו (b/i/big/small/sup…) למילים שבבחירה — פעולת styles אחת לכל שורה;
// בסמן בלי בחירה — למילה שבסמן. on לא בוליאני = החלפה: אם כל המילים כבר
// בסגנון — הסרה, אחרת הוספה. הסרת b מוסיפה (באותה קבוצה) הסרת heavy ממילים
// שיש להן — אחרת הן נשארות מודגשות.
export function planCharStyle(view, tabKey, sel, style, on = undefined, opts = {}) {
  if (!sel?.focus) return EMPTY;
  const c = ctx(view, tabKey);
  const parts = [];
  if (isCollapsed(sel)) {
    const line = c.byId.get(sel.focus.lineId);
    const i = line ? wordIndexAt(textOf(line), sel.focus.offset) : -1;
    if (i < 0) return { ops: [], hint: HINTS.noWord };
    parts.push({ line, lo: i, hi: i });
  } else {
    const [p, q] = ordered(c, sel.anchor, sel.focus);
    for (const r of selectionToLineRanges(view, tabKey, p, q)) {
      const line = c.byId.get(r.lineId);
      const wr = wordRange(textOf(line), r.start, r.end);
      if (wr) parts.push({ line, lo: wr[0], hi: wr[1] });
    }
  }
  const live = parts.filter((x) => !isLockedLine(x.line, opts.locked));
  if (!live.length) return { ops: [], hint: parts.length ? HINTS.locked : HINTS.noWord };
  const turnOn = typeof on === 'boolean' ? on : !live.every((x) => hasStyle(x.line, x.lo, x.hi, style));
  const ops = [];
  for (const x of live) {
    ops.push({ kind: 'styles', page: c.page, ids: [x.line.id], value: { style, words: [x.lo, x.hi], on: turnOn } });
    if (turnOn) continue;
    for (const alias of STYLE_ALIASES[style] || []) {
      if (anyStyle(x.line, x.lo, x.hi, alias)) ops.push({ kind: 'styles', page: c.page, ids: [x.line.id], value: { style: alias, words: [x.lo, x.hi], on: false } });
    }
  }
  const res = { ops, sel };
  if (live.length < parts.length) res.hint = HINTS.lockedSkipped;
  return res;
}

// ---------- אישור פסקה ----------

// אישור הפסקה key: line_ok לכל שורה שלה שאינה נעולה ועוד לא אושרה. שורה
// שמתחלקת עם פסקה אחרת מקבלת חצי-אישור מקומי (SEG_OK) — ו-line_ok רק כשכל
// קטעיה אושרו (כלומר עם אישור הפסקה האחרונה מביניהן).
export function planApprove(view, tabKey, key, opts = {}) {
  if (tabKey === FURNITURE_TAB) return { ops: [], hint: HINTS.furnitureApprove };
  const a = paragraphApproval(view, tabKey, opts);
  const info = a.byKey.get(key);
  if (!info) return EMPTY;
  if (!info.approvable) return { ops: [], hint: HINTS.notApprovable };
  const page = view?.page;
  const segOk = new Set(view?._segOk || []);
  const ops = [];
  for (const s of info.segs) {
    if (s.locked || s.ok) continue;
    if (!s.shared) {
      ops.push({ kind: 'line_ok', page, ids: [s.lineId], _pa: key });
      continue;
    }
    ops.push({ kind: SEG_OK, page, ids: [s.lineId], value: s.w0, _local: true, _pa: key });
    segOk.add(s.key);
    if ((a.segsByLine.get(s.lineId) || []).every((k) => segOk.has(k))) ops.push({ kind: 'line_ok', page, ids: [s.lineId], _pa: key });
  }
  return { ops };
}

// ביטול אישור הפסקה key: פרדיקט ל-useProofEditor.removeWhere — מסיר את כל
// ה-line_ok של שורותיה (בפעולה על כמה שורות — רק את המזהים שלה: מחזיר מערך)
// ואת חצאי-האישור של קטעיה. פסקה אחרת ששורה משותפת בה אושרה נשארת מאושרת:
// אם אישור השורה המשותפת בא מ-line_ok שיורד עכשיו (למשל: הפסקה אושרה, ורק
// אחר-כך חולקה ב-Enter באמצע שורה), לקטע שלה בפסקה השכנה נוסף חצי-אישור —
// pred.add, פעולות שנוספות באותו צעד. null אם אין פסקה כזו.
export function unapproveMatcher(view, tabKey, key, opts = {}) {
  const a = paragraphApproval(view, tabKey, opts);
  const info = a.byKey.get(key);
  if (!info) return null;
  const lines = new Set(info.segs.filter((s) => !s.locked).map((s) => s.lineId));
  const segs = new Set(info.segs.map((s) => s.key));
  const current = view?._segOkOf instanceof Map ? view._segOkOf : null;
  const pred = (op) => {
    if (!op || typeof op !== 'object') return false;
    if (op.kind === SEG_OK) return segs.has(current?.get(op) ?? segKey(op.ids?.[0], op.value));
    if (op.kind !== 'line_ok' || !Array.isArray(op.ids)) return false;
    const hit = op.ids.filter((id) => lines.has(id));
    if (!hit.length) return false;
    return hit.length === op.ids.length ? true : hit;
  };

  // הקטעים של השורות המשותפות בפסקאות האחרות, והאם הפסקה שלהם מאושרת עכשיו
  const paraOfSeg = new Map();
  for (const [pk, p] of a.byKey) for (const s of p.segs) paraOfSeg.set(s.key, { pk, seg: s, approved: p.approved });
  const segOk = view?._segOk instanceof Set ? view._segOk : new Set(view?._segOk || []);
  const byId = new Map(tabLines(view, tabKey).map((l) => [l.id, l]));
  const add = [];
  for (const s of info.segs) {
    if (s.locked || !s.shared || s.pre || !byId.get(s.lineId)?._ok) continue;
    for (const k of a.segsByLine.get(s.lineId) || []) {
      const other = paraOfSeg.get(k);
      if (!other || other.pk === key || !other.approved || segOk.has(k)) continue;
      add.push({ kind: SEG_OK, page: view?.page, ids: [s.lineId], value: other.seg.w0, _local: true, _pa: other.pk });
    }
  }
  pred.add = add;
  return pred;
}

// Ctrl+Enter: אחרי אישור הפסקה — לאן עובר הסמן: הפסקה הבאה שעוד לא אושרה;
// אם אין אחריה — הראשונה שלא אושרה מתחילת הזרם; אם הכול אושר — נשארים.
// {caret, hint?, done} — done = כל הפסקאות בזרם אושרו.
export function nextAfterApprove(view, tabKey, key, opts = {}) {
  if (tabKey === FURNITURE_TAB) return { caret: null, hint: HINTS.furnitureApprove, done: false };
  const paras = buildParagraphs(view, tabKey);
  const a = paragraphApproval(view, tabKey, opts);
  const open = (p) => p.key !== key && a.byKey.get(p.key)?.approvable && !a.byKey.get(p.key)?.approved;
  const i = paras.findIndex((p) => p.key === key);
  const after = paras.slice(i + 1).find(open);
  if (after) return { caret: paragraphStart(after), done: false };
  const before = paras.slice(0, Math.max(0, i)).find(open);
  if (before) return { caret: paragraphStart(before), hint: HINTS.wrapApprove, done: false };
  return { caret: null, hint: HINTS.allApproved, done: true };
}

// ---------- מילים חשודות ----------

// המילים המסומנות בלשונית, בסדר-הקריאה: [{lineId, i, start, end}]
export function suspiciousWords(view, tabKey) {
  const lowWord = lowWordOf(view);
  const byId = new Map(tabLines(view, tabKey).map((l) => [l.id, l]));
  const out = [];
  for (const p of buildParagraphs(view, tabKey)) {
    for (const s of p.lines) {
      const line = byId.get(s.lineId);
      const m = wordMarks(line, lowWord);
      const ws = wordsOf(textOf(line));
      for (let i = s.w0; i <= s.w1; i++) {
        if (m.low.has(i) || m.alts.has(i) || m.lm.has(i)) out.push({ lineId: s.lineId, i, start: ws[i].start, end: ws[i].end });
      }
    }
  }
  return out;
}

// F8 / Shift+F8: המילה המסומנת הבאה/הקודמת מהבחירה (בסוף — חזרה מההתחלה).
// {target, sel, hint?} — sel בוחרת את המילה כולה (הקלדה מחליפה אותה).
export function nextSuspicious(view, tabKey, sel, dir = 1) {
  const list = suspiciousWords(view, tabKey);
  if (!list.length) return { target: null, hint: HINTS.noSuspicious };
  const c = ctx(view, tabKey);
  const known = sel?.focus && c.idx.has(sel.focus.lineId) && (!sel.anchor || c.idx.has(sel.anchor.lineId));
  let target = null;
  let hint;
  if (!known) {
    target = dir < 0 ? list[list.length - 1] : list[0];
  } else {
    const [p, q] = isCollapsed(sel) ? [sel.focus, sel.focus] : ordered(c, sel.anchor, sel.focus);
    const cmp = (li, off, pos) => li - c.idx.get(pos.lineId) || off - pos.offset;
    if (dir < 0) {
      for (let k = list.length - 1; k >= 0 && !target; k--) if (cmp(c.idx.get(list[k].lineId), list[k].end, p) < 0) target = list[k];
      if (!target) [target, hint] = [list[list.length - 1], HINTS.wrapPrev];
    } else {
      target = list.find((w) => cmp(c.idx.get(w.lineId), w.start, q) > 0) || null;
      if (!target) [target, hint] = [list[0], HINTS.wrapNext];
    }
  }
  const res = {
    target,
    sel: { anchor: { lineId: target.lineId, offset: target.start }, focus: { lineId: target.lineId, offset: target.end } },
  };
  if (hint) res.hint = hint;
  return res;
}

// ---------- קישורים ----------

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
// הסימן הקטן שמוצג אחרי מילה שהיא קצה של קישור (אותו מספר בשני הקצוות)
export const linkBadge = (n) => (Number.isInteger(n) && n >= 1 && n <= 20 ? [...CIRCLED][n - 1] : `(${n})`);

// "עמוד 4, שורה 12: «…»" — קצה-קישור שבעמוד אחר. מספר-השורה ותחילת הטקסט מחוזה-העמוד
// (to_line_no/to_text, from_line_no/from_text) או מהפעולה; בלעדיהם — מזהה-השורה
export function farLabel(page, lineNo, lineId, text) {
  const t = String(text || '').trim();
  const short = t.length > 32 ? `${t.slice(0, 32)}…` : t;
  return `עמוד ${page}, שורה ${lineNo != null ? lineNo + 1 : lineId}${short ? `: «${short}»` : ''}`;
}

// קצות-הקישורים בעמוד, לכל שורה ומילה: Map(מזהה-שורה → Map(מספר-מילה →
// [{n, kind, side, other:{lineId, page, i}}])). n = מספר הקישור בעמוד (1…).
// המילה: מטווח-המילים של הקישור (to_words/words בגוף, from_words בהערה — הקצה
// האחרון של הטווח), ואחרת מציון-ההערה בשורה (marks, לפי מיקום-התווים).
// בצד ההערה בלי מידע — המילה הראשונה; בצד הגוף בלי מידע — בלי סימן.
export function linkEndpoints(view) {
  const lines = new Map((view?.lines || []).filter((l) => l && l.status !== 'removed').map((l) => [l.id, l]));
  const marks = view?.marks && typeof view.marks === 'object' ? view.marks : {};
  const out = new Map();
  const add = (lineId, i, ep) => {
    if (!lines.has(lineId) || !Number.isInteger(i) || i < 0) return;
    if (!out.has(lineId)) out.set(lineId, new Map());
    const m = out.get(lineId);
    if (!m.has(i)) m.set(i, []);
    m.get(i).push(ep);
  };
  const markWord = (lineId, pred) => {
    const list = marks[String(lineId)];
    const line = lines.get(lineId);
    const mk = Array.isArray(list) && line ? list.find((x) => x && pred(x)) : null;
    if (!mk || !Number.isFinite(mk.a)) return null;
    const i = wordAt(textOf(line), mk.a);
    return i >= 0 ? i : null;
  };
  (view?.links || []).forEach((k, idx) => {
    if (!k) return;
    const n = idx + 1;
    const samePage = k.to_page == null || k.to_page === view.page;
    const toRange = Array.isArray(k.to_words) ? k.to_words : Array.isArray(k.words) ? k.words : null;
    let fi = Array.isArray(k.from_words) ? k.from_words[1] : markWord(k.from_line, (x) => x.role === 'opener');
    if (fi == null && lines.has(k.from_line)) fi = 0;
    const ti = samePage
      ? toRange
        ? toRange[1]
        : markWord(k.to_line, (x) => x.role === 'anchor' && (x.go == null || x.go === k.from_line))
      : null;
    // צד בעמוד אחר (קישור-סעיף שזולג, או קישור שהמתנדב יצר לעמוד אחר): העמוד שלו, ו-label
    // לריחוף על המספר — "עמוד 4, שורה 12: «…»"
    const toPage = k.to_page ?? view?.page;
    const fromPage = k.from_page ?? view?.page;
    const farTo = toPage !== view?.page ? { label: farLabel(toPage, k.to_line_no, k.to_line, k.to_text) } : null;
    const farFrom = fromPage !== view?.page ? { label: farLabel(fromPage, k.from_line_no, k.from_line, k.from_text) } : null;
    add(k.from_line, fi, { n, kind: k.kind, side: 'from', other: { lineId: k.to_line, page: toPage, i: ti, ...farTo } });
    if (ti != null) add(k.to_line, ti, { n, kind: k.kind, side: 'to', other: { lineId: k.from_line, page: fromPage, i: fi, ...farFrom } });
  });
  return out;
}

// ---------- העתקה ----------

// הטקסט של הבחירה כמו שהוא במודל (בלי הסימונים שעל המסך): שורות של אותה
// פסקה — ברווח, פסקאות — בירידת-שורה
export function selectionText(view, tabKey, sel) {
  if (!sel?.focus || isCollapsed(sel)) return '';
  const c = ctx(view, tabKey);
  if (!c.idx.has(sel.anchor.lineId) || !c.idx.has(sel.focus.lineId)) return '';
  const [p, q] = ordered(c, sel.anchor, sel.focus);
  const P = [c.idx.get(p.lineId), p.offset];
  const Q = [c.idx.get(q.lineId), q.offset];
  const cmp = (x, y) => x[0] - y[0] || x[1] - y[1];
  const out = [];
  for (const para of buildParagraphs(view, tabKey)) {
    const parts = [];
    for (const s of para.lines) {
      const li = c.idx.get(s.lineId);
      const a = cmp([li, s.start], P) >= 0 ? [li, s.start] : P;
      const b = cmp([li, s.end], Q) <= 0 ? [li, s.end] : Q;
      if (a[0] !== li || b[0] !== li || a[1] >= b[1]) continue;
      parts.push(textOf(c.byId.get(s.lineId)).slice(a[1], b[1]));
    }
    if (parts.length) out.push(parts.join(' '));
  }
  return out.join('\n');
}
