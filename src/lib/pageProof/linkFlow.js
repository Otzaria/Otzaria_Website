// קישור ברמת-מילה בין שני זרמים (עורך הגהת-העמודים): המתנדב מסמן מילה בזרם
// אחד, לוחץ "קישור" (Ctrl+K), עובר ללשונית של הזרם השני, מסמן את המילה
// המקבילה ולוחץ שוב. כאן — החלק הטהור: מה נבחר בכל צד, ואיזו פעולת link_add
// נוצרת. ids = [צד ההערה/הפירוש, צד הגוף]; value = טווחי-המילים וסוג הקישור.
// בלי DOM — העורך מעביר את הבחירה כמקומות-סמן ({lineId, offset}).

import { tokenize, wordRange, tabLines, buildParagraphs, selectionToLineRanges, streamTabs, FURNITURE_TAB } from './textModel.js';
import { isFurnitureStream } from './vocab.js';
import { isCollapsed, wordIndexAt, farLabel } from './flowEdit.js';
import { FAR_TEXT_SENT } from './ops.js';

export const LINK_ERRORS = Object.freeze({
  noWord: 'סמנו קודם מילה בטקסט (או הציבו עליה את הסמן) ואז לחצו "קישור"',
  furniture: 'ריהוט הדף (כותרת-רצה, מספר עמוד) אינו מקושר',
  temp: 'שורה שנוצרה בתיקון החיתוך אינה מקושרת עד הזיהוי מחדש',
  sameStream: 'קישור הוא בין שני זרמים שונים',
  gone: 'השורה שבחרתם בצד הראשון כבר אינה בעמוד — התחילו את הקישור מחדש',
  samePage: 'זה העמוד שאתם מגיהים — סמנו את המילה כאן בטקסט ולחצו שוב "קישור"',
  farWord: 'בחרו מילה בשורה של העמוד האחר',
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

// ---------- קישור לעמוד אחר ----------
//
// פירוש שזולג אל אחרי הסעיף שלו (או לפניו): הצד הראשון נבחר בעמוד שמגיהים, והשני — בעמוד
// אחר של הספר, שמוצג לקריאה בלבד (GET /api/page-proof/books/[gid]/pages/[n]/lines). הפעולה
// נשארת link_add של העמוד הנוכחי; הצד הזר מוצהר בערך (ops.farLinkSide).

// "עמוד 4, שורה 12: «…»" — שורה שבעמוד אחר (מוגדר ב-flowEdit, שם גם הסימונים שבטקסט)
export { farLabel };

// מספר-עמוד מהכתובת: שלם וחיובי (עד 100,000), אחרת null
export function pageNoParam(raw) {
  const s = String(Array.isArray(raw) ? raw[0] : (raw ?? '')).trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 100000 ? n : null;
}

// השורות של עמוד שמור, לקריאה בלבד: רק מה שצריך כדי להציג אותו לפי זרמים ופסקאות כמו
// העורך ולבחור בו מילה — בלי שורות שהוסרו, בסדר-הקריאה
export function pageLinesOf(doc) {
  return (doc?.lines || [])
    .filter((l) => l && Number.isInteger(l.id) && l.id > 0 && l.status !== 'removed')
    .map((l, i) => {
      const out = {
        id: l.id,
        line_no: Number.isInteger(l.line_no) ? l.line_no : null,
        order: Number.isFinite(l.order) ? l.order : i + 1,
        stream: l.stream || 'main',
        para_start: !!l.para_start,
        para_style: l.para_style || null,
        text: String(l.text ?? l.text_ocr ?? ''),
      };
      const breaks = Array.isArray(l.para_breaks) ? l.para_breaks.filter((k) => Number.isInteger(k) && k >= 0) : [];
      if (breaks.length) out.para_breaks = breaks;
      return out;
    })
    .sort((a, b) => a.order - b.order);
}

// עמוד אחר כ"תצוגה" קטנה (בשביל streamTabs / buildParagraphs של העורך): השורות שהגיעו
// מהשרת, ושמות הזרמים וצבעיהם — של הספר, מהעמוד הנוכחי
export function otherPageView(view, page, lines) {
  return {
    page,
    lines: (lines || []).map((l, i) => ({ ...l, order: Number.isFinite(l.order) ? l.order : i + 1, status: 'pending' })),
    streams: view?.streams || [],
    stream_vocab: view?.stream_vocab || [],
    links: [],
    marks: {},
    frames: [],
  };
}

// הלשוניות של העמוד האחר — בלי ריהוט הדף (הוא אינו מקושר)
export const otherPageTabs = (fview) => streamTabs(fview).filter((t) => !t.furniture);

// הלשונית שנפתחת קודם: הזרם "השני" — לצד-הערה פותחים את הגוף, לצד-גוף את ההערות/הפירוש
export function defaultOtherTab(tabs, firstStream) {
  const list = tabs || [];
  const wantCommentary = !isCommentaryStream(firstStream);
  const other = list.find((t) => isCommentaryStream(t.key) === wantCommentary && t.key !== baseStream(firstStream));
  return (other || list.find((t) => t.key !== baseStream(firstStream)) || list[0])?.key ?? null;
}

// מילה שנבחרה בעמוד האחר: {page, lineId, lineNo, stream, words:[i, i], text, lineText} או {error}
export function otherPagePick(fview, lineId, wordIndex) {
  const line = (fview?.lines || []).find((l) => l.id === lineId);
  if (!line) return { error: LINK_ERRORS.farWord };
  if (isFurnitureStream(line.stream)) return { error: LINK_ERRORS.furniture };
  const words = wordsOf(line.text);
  if (!Number.isInteger(wordIndex) || wordIndex < 0 || wordIndex >= words.length) return { error: LINK_ERRORS.farWord };
  return {
    page: fview.page,
    lineId: line.id,
    lineNo: Number.isInteger(line.line_no) ? line.line_no : null,
    stream: line.stream,
    words: [wordIndex, wordIndex],
    text: words[wordIndex].text,
    lineText: String(line.text || ''),
  };
}

// השלמת קישור שהצד השני שלו בעמוד אחר: first = הצד שנבחר בעמוד הזה (linkEnd), pick =
// otherPagePick, fview = העמוד האחר (לסגנון-הפסקה של צד-ההערה כשהוא שם). הכיוון והסוג —
// כמו planLink; הצד שבעמוד האחר מוצהר בערך: to_page/to_line_no/to_text כשהוא הגוף,
// from_page/from_line_no/from_text כשהוא ההערה/הפירוש. {op} או {error}.
export function planOtherPageLink(view, first, pick, fview) {
  const a = (view?.lines || []).find((l) => l && l.id === first?.lineId && l.status !== 'removed');
  if (!a) return { error: LINK_ERRORS.gone };
  if (!pick || !Number.isInteger(pick.lineId) || !Array.isArray(pick.words)) return { error: LINK_ERRORS.farWord };
  if (pick.page === view.page) return { error: LINK_ERRORS.samePage };
  if (isFurnitureStream(a.stream) || isFurnitureStream(pick.stream)) return { error: LINK_ERRORS.furniture };
  if (baseStream(a.stream) === baseStream(pick.stream)) return { error: LINK_ERRORS.sameStream };
  const farIsFrom = isCommentaryStream(pick.stream) && !isCommentaryStream(a.stream);
  const style = farIsFrom ? paraStyleAt(fview, pick.lineId, pick.words[0]) : paraStyleAt(view, first.lineId, first.words[0]);
  const side = farIsFrom ? 'from' : 'to';
  const value = {
    from_words: (farIsFrom ? pick.words : first.words).slice(),
    to_words: (farIsFrom ? first.words : pick.words).slice(),
    kind: style === 'dh' ? 'dh' : 'note',
    [`${side}_page`]: pick.page,
    [`${side}_line_no`]: pick.lineNo,
    [`${side}_text`]: String(pick.lineText || '').trim().slice(0, FAR_TEXT_SENT),
  };
  return { op: { kind: 'link_add', page: view.page, ids: farIsFrom ? [pick.lineId, a.id] : [a.id, pick.lineId], value } };
}
