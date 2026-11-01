// שורת המסך של הסמן (לוגיקה טהורה): בטקסט שגולש (עמוד/פסקה שמגיעים כגוש) שורה לוגית אחת
// תופסת כמה שורות מסך, ולכן "השורה של הסמן" לצורך גלילת הצילום היא שורת המסך שבה הסמן
// נמצא — לא ראש השורה הלוגית. כאן רק החשבון; המדידה (Range על שכבת ה-mirror) ב-useScanFollow.

/**
 * שורה ועמודה (מ-0) של היסט בטקסט. \r שלפני \n לא נספר בעמודה של סוף השורה.
 * @param {string} text
 * @param {number} pos
 * @returns {{ line: number, col: number }}
 */
export function lineColAt(text, pos) {
  const s = String(text ?? '');
  const p = Math.max(0, Math.min(Number.isFinite(pos) ? Math.trunc(pos) : 0, s.length));
  let line = 0;
  let start = 0;
  for (let i = s.indexOf('\n'); i >= 0 && i < p; i = s.indexOf('\n', i + 1)) {
    line++;
    start = i + 1;
  }
  return { line, col: p - start };
}

/**
 * עמודה בשורה → איזה צומת טקסט (לפי אורכי הצמתים, בסדר) ואיזה היסט בו. עמודה שבדיוק בגבול
 * בין שני צמתים שייכת לצומת הבא (התו שאחרי הסמן), חוץ מסוף השורה — הצומת האחרון.
 * @param {number[]} lengths
 * @param {number} col
 * @returns {{ index: number, offset: number }|null} null כשאין צמתים לא-ריקים
 */
export function locateCol(lengths, col) {
  const L = (lengths || []).map((n) => Math.max(0, Number(n) || 0));
  let last = -1;
  for (let i = 0; i < L.length; i++) if (L[i] > 0) last = i;
  if (last < 0) return null;
  let c = Math.max(0, Number.isFinite(col) ? Math.trunc(col) : 0);
  for (let i = 0; i < L.length; i++) {
    if (!L[i]) continue;
    if (c < L[i]) return { index: i, offset: c };
    if (i === last) return { index: i, offset: L[i] };
    c -= L[i];
  }
  return { index: last, offset: L[last] };
}

/**
 * מרכז שורת המסך של הסמן מתוך התיבות שנמדדו: התו שאחרי הסמן (after), ואם אין לו גובה (סוף
 * שורה / תו ריק) — התו שלפניו (before). null כשאין שום תיבה תקינה.
 * @param {{ top: number, bottom: number }|null|undefined} after
 * @param {{ top: number, bottom: number }|null|undefined} [before]
 */
export function caretRowMid(after, before = null) {
  for (const r of [after, before]) {
    if (r && Number.isFinite(r.top) && Number.isFinite(r.bottom) && r.bottom > r.top) return (r.top + r.bottom) / 2;
  }
  return null;
}

/**
 * האם נקודה (מרכז שורת הסמן) בתוך החלון הנראה של ה-textarea, עם שוליים.
 * @param {number|null} y
 * @param {number} top
 * @param {number} bottom
 * @param {number} [margin]
 */
export function rowInView(y, top, bottom, margin = 0) {
  return Number.isFinite(y) && y >= top + margin && y <= bottom - margin;
}

/**
 * גלילת השדה אחרי לחיצה על הצילום: ה-scrollTop שמעמיד את שורת הסמן מול השורה שנלחצה בצילום
 * (targetY), ואם הנקודה מחוץ לחלון השדה (או לא ידועה) — באמצע החלון. מוגבל לטווח הגלילה.
 * rowY — מרכז שורת הסמן (clientY) כפי שנמדד כשהשכבה הנמדדת הייתה גלולה ל-measuredScroll (כך
 * שהחישוב נכון גם אם השדה עצמו כבר גלל מאז — שכבת ה-mirror מסתנכרנת רק באירוע הגלילה).
 * @param {{ rowY: number|null, targetY?: number|null, viewTop: number, viewBottom: number,
 *   measuredScroll: number, maxScroll: number, margin?: number }} p
 * @returns {number|null} null כשאין מדידה
 */
export function revealScrollTop({ rowY, targetY = null, viewTop, viewBottom, measuredScroll, maxScroll, margin = 0 }) {
  if (!Number.isFinite(rowY) || !Number.isFinite(viewTop) || !Number.isFinite(viewBottom) || !(viewBottom > viewTop)) return null;
  const want = Number.isFinite(targetY) && targetY >= viewTop + margin && targetY <= viewBottom - margin ? targetY : (viewTop + viewBottom) / 2;
  const top = (Number(measuredScroll) || 0) + rowY - want;
  return Math.round(Math.max(0, Math.min(Math.max(0, Number(maxScroll) || 0), top)));
}
