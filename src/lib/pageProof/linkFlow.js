// קישור ברמת-מילה בין שני זרמים (עורך הגהת-העמודים): המתנדב מסמן מילה בזרם
// אחד, לוחץ "קישור" (Ctrl+K), עובר ללשונית של הזרם השני, מסמן את המילה
// המקבילה ולוחץ שוב. כאן — החלק הטהור: מה נבחר בכל צד, ואיזו פעולת link_add
// נוצרת. ids = [צד ההערה/הפירוש, צד הגוף]; value = טווחי-המילים וסוג הקישור.
// בלי DOM — העורך מעביר את הבחירה כמקומות-סמן ({lineId, offset}).

import { tokenize, wordRange, tabLines, buildParagraphs, selectionToLineRanges, FURNITURE_TAB } from './textModel.js';
import { isFurnitureStream } from './vocab.js';
import { isCollapsed, wordIndexAt } from './flowEdit.js';

export const LINK_ERRORS = Object.freeze({
  noWord: 'סמנו קודם מילה בטקסט (או הציבו עליה את הסמן) ואז לחצו "קישור"',
  furniture: 'ריהוט הדף (כותרת-רצה, מספר עמוד) אינו מקושר',
  temp: 'שורה שנוצרה בתיקון החיתוך אינה מקושרת עד הזיהוי מחדש',
  sameStream: 'קישור הוא בין שני זרמים שונים',
  gone: 'השורה שבחרתם בצד הראשון כבר אינה בעמוד — התחילו את הקישור מחדש',
});

export const LINK_HINTS = Object.freeze({
  multiLine: 'הקישור נקבע למילים בשורה הראשונה של הבחירה',
});

// זרם-הבסיס (בלי _heading)
export const baseStream = (stream) => String(stream || 'main').replace(/_heading$/, '') || 'main';

// הלשונית שבה מוצגת השורה: זרם-הבסיס שלה, או "ריהוט הדף"
export const tabOfLine = (line) => (isFurnitureStream(line?.stream) ? FURNITURE_TAB : baseStream(line?.stream));

// זרם של הערות/פירוש (צד ה"from" של הקישור): notes, notes2…, margin, s_*
export function isCommentaryStream(stream) {
  const b = baseStream(stream);
  return /^notes\d*$/.test(b) || b === 'margin' || b.startsWith('s_');
}

const wordsOf = (text) => tokenize(text).filter((t) => t.w === 'word');

// מקום-הסמן בתחילת המילה i של השורה (או בתחילת השורה)
export function wordStartPos(line, i) {
  const w = Number.isInteger(i) && i >= 0 ? wordsOf(line?.text ?? '')[i] : null;
  return { lineId: line?.id, offset: w ? w.start : 0 };
}

// צד אחד של הקישור מהבחירה בלשונית: {lineId, words:[lo, hi], tabKey, text,
// stream, hint?} — או {error}. בחירה על פני כמה שורות ← המילים בשורה
// הראשונה שיש בה מילים (קישור הוא בין שתי שורות).
export function linkEnd(view, tabKey, sel) {
  if (tabKey === FURNITURE_TAB) return { error: LINK_ERRORS.furniture };
  if (!sel?.focus) return { error: LINK_ERRORS.noWord };
  const byId = new Map(tabLines(view, tabKey).map((l) => [l.id, l]));
  let lineId = null;
  let range = null;
  let multi = false;
  if (isCollapsed(sel)) {
    const line = byId.get(sel.focus.lineId);
    const i = line ? wordIndexAt(String(line.text ?? ''), sel.focus.offset) : -1;
    if (i < 0) return { error: LINK_ERRORS.noWord };
    lineId = line.id;
    range = [i, i];
  } else {
    const ranges = selectionToLineRanges(view, tabKey, sel.anchor, sel.focus);
    const hits = ranges
      .map((r) => ({ r, wr: wordRange(String(byId.get(r.lineId)?.text ?? ''), r.start, r.end) }))
      .filter((x) => x.wr);
    if (!hits.length) return { error: LINK_ERRORS.noWord };
    lineId = hits[0].r.lineId;
    range = hits[0].wr;
    multi = hits.length > 1;
  }
  const line = byId.get(lineId);
  if (!(line.id > 0) || line._new) return { error: LINK_ERRORS.temp };
  const text = wordsOf(line.text)
    .slice(range[0], range[1] + 1)
    .map((w) => w.text)
    .join(' ');
  const out = { lineId, words: range, tabKey, text, stream: line.stream };
  if (multi) out.hint = LINK_HINTS.multiLine;
  return out;
}

// סגנון-הפסקה שבה נמצאות המילים (לסוג הקישור: ד"ה או הערה)
function paraStyleAt(view, lineId, word) {
  const line = (view?.lines || []).find((l) => l.id === lineId);
  if (!line) return null;
  for (const p of buildParagraphs(view, tabOfLine(line))) {
    if (p.lines.some((s) => s.lineId === lineId && word >= s.w0 && (word <= s.w1 || s.w1 < s.w0))) return p.style;
  }
  return null;
}

// השלמת הקישור: first = הצד שנבחר קודם, second = הצד שנבחר עכשיו.
// צד-ההערה (from) הוא זה שבזרם הערות/פירוש; אם שניהם (או אף אחד) — הראשון.
// kind: 'dh' אם הפסקה של צד-ההערה היא "דיבור המתחיל", אחרת 'note'.
// מחזיר {op} או {error}.
export function planLink(view, first, second) {
  const byId = new Map((view?.lines || []).filter((l) => l && l.status !== 'removed').map((l) => [l.id, l]));
  const a = byId.get(first?.lineId);
  const b = byId.get(second?.lineId);
  if (!a || !b) return { error: LINK_ERRORS.gone };
  if (isFurnitureStream(a.stream) || isFurnitureStream(b.stream)) return { error: LINK_ERRORS.furniture };
  if (a.id === b.id || baseStream(a.stream) === baseStream(b.stream)) return { error: LINK_ERRORS.sameStream };
  const secondIsFrom = isCommentaryStream(b.stream) && !isCommentaryStream(a.stream);
  const [from, to] = secondIsFrom ? [second, first] : [first, second];
  const kind = paraStyleAt(view, from.lineId, from.words[0]) === 'dh' ? 'dh' : 'note';
  return {
    op: {
      kind: 'link_add',
      page: view.page,
      ids: [from.lineId, to.lineId],
      value: { from_words: from.words.slice(), to_words: to.words.slice(), kind },
    },
  };
}
