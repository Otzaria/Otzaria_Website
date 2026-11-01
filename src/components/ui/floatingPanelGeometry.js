/**
 * גאומטריה של חלון צף שאינו מודאלי (FloatingPanel) — לוגיקה טהורה, floatingPanelGeometry.test.js.
 *
 * המיקום נשמר כ-{ x, y } = הפינה השמאלית-העליונה בפיקסלים של החלון (left/top), כמו שנשמר
 * ב-localStorage לפני המעבר, כך שמיקומים ישנים ממשיכים לעבוד.
 */

/** מרווח מינימלי מקצות החלון */
export const PANEL_MARGIN = 16
/** כמה מגובה החלון חייב להישאר גלוי מתחת לקצה התחתון (לפחות הכותרת — ידית הגרירה) */
export const PANEL_MIN_VISIBLE = 120

/** הרוחב בפועל: הרוחב המבוקש, אבל לא יותר מרוחב החלון פחות שני המרווחים */
export function panelWidth(requested, viewportWidth) {
  return Math.max(0, Math.min(requested, viewportWidth - PANEL_MARGIN * 2))
}

/**
 * מצמיד מיקום לגבולות החלון: החלון כולו בתוך הרוחב, והכותרת בתוך הגובה.
 * @param {{ x: number, y: number }} pos
 * @param {number} width — הרוחב בפועל (panelWidth)
 * @param {{ width: number, height: number }} viewport
 */
export function clampPanelPosition(pos, width, viewport) {
  const maxX = Math.max(PANEL_MARGIN, viewport.width - width - PANEL_MARGIN)
  const maxY = Math.max(PANEL_MARGIN, viewport.height - PANEL_MIN_VISIBLE)
  const x = Number.isFinite(pos?.x) ? pos.x : PANEL_MARGIN
  const y = Number.isFinite(pos?.y) ? pos.y : PANEL_MARGIN
  return {
    x: Math.round(Math.min(Math.max(PANEL_MARGIN, x), maxX)),
    y: Math.round(Math.min(Math.max(PANEL_MARGIN, y), maxY)),
  }
}

/** קורא מיקום שמור (מחרוזת JSON) — null אם אין / פגום */
export function parseSavedPosition(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.x !== 'number' || typeof parsed?.y !== 'number') return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

/** גובה מקסימלי: 85% מגובה החלון, ולא מעבר לקצה התחתון מהמיקום הנוכחי */
export function panelMaxHeight(y, viewportHeight) {
  return Math.max(PANEL_MIN_VISIBLE, Math.min(viewportHeight * 0.85, viewportHeight - y - PANEL_MARGIN))
}
