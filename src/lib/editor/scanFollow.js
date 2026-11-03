// מעקב הצילום אחרי הסמן (לוגיקה טהורה): גובה שורה "מקביל" בטקסט, הגלילה המתואמת של
// הצילום, ותיבת המילה (מדויקת לפי יישור, או יחסית לפי מספר התווים כשיש רק תיבת שורה).
// כל הקואורדינטות בפיקסלים טבעיים של התמונה, חוץ ממה שמסומן "מסך" (= טבעי × zoom).

import { alignLine, estimateInserted, matchedBox, CONFIDENT_COST } from './wordAlign.js';

const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);

/**
 * גובה שורה בטקסט שמקביל לגובה השורה בצילום (מצב "פנים אל פנים"): pitch·zoom, קטום.
 * @param {number} linePitchPx מרווח השורות בצילום (טבעי)
 * @param {number} zoom
 * @param {number} minPx למשל 1.5 × גודל הגופן
 * @param {number} maxPx למשל 3 × גודל הגופן
 */
export function facingLineHeight(linePitchPx, zoom, minPx, maxPx) {
  const lo = fin(minPx, 0);
  const hi = Math.max(lo, fin(maxPx, lo));
  const v = fin(linePitchPx) * fin(zoom);
  return v > 0 ? clamp(v, lo, hi) : lo;
}

/**
 * מרווח השורות החציוני של רשימת תיבות-שורה (מרחק בין מרכזים עוקבים), או גובה השורה החציוני.
 * @param {{ bbox: number[] }[]} lines
 */
export function linePitch(lines) {
  const bs = (lines || []).map((l) => l?.bbox).filter(isBox);
  const mids = bs.map((b) => (b[1] + b[3]) / 2).sort((a, b) => a - b);
  const d = [];
  for (let i = 1; i < mids.length; i++) if (mids[i] - mids[i - 1] > 0) d.push(mids[i] - mids[i - 1]);
  const src = d.length ? d : bs.map((b) => b[3] - b[1]).filter((h) => h > 0);
  if (!src.length) return 0;
  src.sort((a, b) => a - b);
  return src[Math.floor(src.length / 2)];
}

/**
 * גובה הסמן שמולו מעמידים את השורה: הסמן עצמו כשהוא בתוך החלון — ליד הקצה (פחות מ-edge,
 * למשל עורך שגולל רק עד שהסמן נראה בתחתית) קטום ל-[edge, viewportH − edge], כדי שהצילום
 * עדיין יעמוד מולו ולא "יקפוץ" לגובה קבוע. NaN — הסמן מחוץ לחלון / לא ידוע.
 * @param {number} caret
 * @param {number} viewportH
 * @param {number} edge
 */
export function facingCaretY(caret, viewportH, edge) {
  if (!Number.isFinite(caret) || caret < 0 || caret > viewportH) return NaN;
  const e = Math.min(fin(edge), viewportH / 2);
  return clamp(caret, e, viewportH - e);
}

/**
 * גלילת הצילום (scrollTop, מסך) שמעמידה את מרכז השורה מול מרכז השורה של הסמן:
 * scanTop = lineMid·zoom + contentOffset − caretMid (הסמן קטום לשולי החלון, facingCaretY).
 * כשהסמן מחוץ לחלון — מעמידים את השורה בגובה fallbackRatio מהחלון. קטום ל-[0, contentH − viewportH].
 * @param {{ lineMidPx: number, zoom: number, caretMidInViewport: number, viewportH: number,
 *   contentH: number, contentOffset?: number, edge?: number, fallbackRatio?: number }} p
 * @returns {number|null} null כשהקלט לא תקין
 */
export function followScroll({ lineMidPx, zoom, caretMidInViewport, viewportH, contentH, contentOffset = 0, edge = 20, fallbackRatio = 0.4 }) {
  if (![lineMidPx, zoom, viewportH].every(Number.isFinite) || !(viewportH > 0) || !(zoom > 0)) return null;
  const mid = lineMidPx * zoom + fin(contentOffset);
  const caret = facingCaretY(fin(caretMidInViewport, NaN), viewportH, edge);
  const target = Number.isFinite(caret) ? mid - caret : mid - viewportH * fallbackRatio;
  const max = Math.max(0, fin(contentH, Infinity) - viewportH);
  return Math.round(clamp(target, 0, max));
}

/**
 * כמה "מרווח גלילה" חסר מעל/מתחת לצילום כדי שהשורה תוכל לעמוד מול הסמן: בצילום דו-טורי
 * השורות של הטור השני נמצאות בראש התמונה, ובלי מרווח מעליה אי אפשר לגלול אותן מטה אל מול סמן
 * שבתחתית חלון הטקסט. אותם פרמטרים כמו followScroll; כל צד קטום ל-[0, viewportH − 2·edge].
 * @param {Parameters<typeof followScroll>[0]} p
 * @returns {{ top: number, bottom: number }}
 */
export function followSlack({ lineMidPx, zoom, caretMidInViewport, viewportH, contentH, contentOffset = 0, edge = 20 }) {
  const none = { top: 0, bottom: 0 };
  if (![lineMidPx, zoom, viewportH, contentH].every(Number.isFinite) || !(viewportH > 0) || !(zoom > 0)) return none;
  // רק כשהסמן בתוך החלון — אחרת followScroll ממילא מעמיד בגובה קבוע
  const caret = facingCaretY(fin(caretMidInViewport, NaN), viewportH, edge);
  if (!Number.isFinite(caret)) return none;
  const target = lineMidPx * zoom + fin(contentOffset) - caret;
  const max = Math.max(0, contentH - viewportH);
  const cap = Math.max(0, viewportH - 2 * edge);
  return { top: Math.round(clamp(-target, 0, cap)), bottom: Math.round(clamp(target - max, 0, cap)) };
}

/**
 * האם להשאיר את הצילום במקומו (אנכית): הסמן עבר שורה בטקסט (שבירת שורות אחרת מהצילום) אבל
 * בצילום זו עדיין אותה שורה, והיא נראית בנוחות — במרחק margin (חלק מגובה החלון) מהקצוות.
 * בלי זה הצילום "יורד" עם כל שורת מסך בטקסט גם כשבצילום לא עברו שורה.
 * @param {{ sameLine: boolean, lineMidInViewport: number, viewportH: number, margin?: number }} p
 */
export function holdScanLine({ sameLine, lineMidInViewport, viewportH, margin = 0.15 }) {
  if (!sameLine || !Number.isFinite(lineMidInViewport) || !(viewportH > 0)) return false;
  const m = viewportH * clamp(fin(margin), 0, 0.49);
  return lineMidInViewport >= m && lineMidInViewport <= viewportH - m;
}

/**
 * תיבה יחסית למילה כשיש רק תיבת שורה: לפי מקום התווים בשורה, מימין לשמאל.
 * @param {number[]} lineBox [x0,y0,x1,y1]
 * @param {number} wordStartChar
 * @param {number} wordEndChar
 * @param {number} lineLen
 * @returns {number[]|null}
 */
export function proportionalWordBox(lineBox, wordStartChar, wordEndChar, lineLen) {
  if (!isBox(lineBox)) return null;
  const T = Math.max(1, fin(lineLen, 1));
  const s = clamp(fin(wordStartChar), 0, T);
  const e = clamp(Math.max(s, fin(wordEndChar, s)), 0, T);
  const [x0, y0, x1, y1] = lineBox;
  const span = x1 - x0;
  return [x1 - (e / T) * span, y0, x1 - (s / T) * span, y1];
}

/**
 * @typedef {'solid'|'dashed'|'under'} BoxKind
 *   solid — התאמה בטוחה; dashed — משוערת (עלות גבוהה / נוספה); under — יחסית (רק תיבת שורה)
 */

/**
 * התיבה של מילת הסמן בצילום — הגרסה המחוזקת של wordBoxFor מההדמיה.
 * @param {{ bbox: number[], words?: { text?: string|null, bbox: number[] }[] }|null} line שורת הצילום
 * @param {{ words: { text: string, start: number, end: number }[], word: number, lineText: string }} caret מ-caretInfo
 * @param {{ alignment?: import('./wordAlign.js').WordMatch[] }} [opts] יישור מחושב מראש (memo)
 * @returns {{ box: number[]|null, kind: BoxKind|null, alignment: import('./wordAlign.js').WordMatch[]|null }}
 */
export function wordBoxFor(line, caret, { alignment = null } = {}) {
  const none = { box: null, kind: null, alignment: null };
  if (!line || !isBox(line.bbox) || !caret?.words?.length || caret.word < 0) return none;
  const w = caret.words[caret.word];
  const scan = (line.words || []).filter((x) => isBox(x?.bbox));
  if (!scan.length) {
    return { box: proportionalWordBox(line.bbox, w.start, w.end, caret.lineText.length), kind: 'under', alignment: null };
  }
  const texts = caret.words.map((x) => x.text);
  const al = alignment || alignLine(texts, scan);
  const m = al[caret.word];
  const own = matchedBox(al, scan, caret.word);
  if (own) return { box: own, kind: m.confident && m.cost <= CONFIDENT_COST ? 'solid' : 'dashed', alignment: al };
  return { box: estimateInserted(texts, al, scan, caret.word, { lineBox: line.bbox }), kind: 'dashed', alignment: al };
}
