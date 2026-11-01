/**
 * מיקום כרטיס-הרמז (ui/Tooltip) — לוגיקה טהורה, בלי DOM.
 *
 * הרמז מוצג מתחת לרכיב כברירת מחדל; כשאין מתחתיו מקום (שורת המצב בתחתית המסך) והמקום
 * מעליו מספיק — או לפחות גדול יותר — הוא מתהפך למעלה.
 */

export type TooltipSide = 'bottom' | 'top'

export function tooltipSide({ anchorTop, anchorBottom, height, gap, viewportHeight, margin = 8 }: {
  anchorTop: number
  anchorBottom: number
  /** גובה הכרטיס עצמו */
  height: number
  /** המרווח (הגשר) בין הרכיב לכרטיס */
  gap: number
  viewportHeight: number
  margin?: number
}): TooltipSide {
  const need = gap + height + margin
  const below = viewportHeight - anchorBottom
  const above = anchorTop
  if (below >= need) return 'bottom'
  if (above >= need) return 'top'
  return above > below ? 'top' : 'bottom'
}

/** "דילוג על ההשהיה": רמז שנפתח זמן קצר אחרי שרמז שכן נסגר — מוצג מיד (מעבר בין כפתורים בשורה) */
export const TOOLTIP_SKIP_DELAY_MS = 600

export function shouldSkipDelay(now: number, lastHiddenAt: number, windowMs = TOOLTIP_SKIP_DELAY_MS): boolean {
  return lastHiddenAt > 0 && now - lastHiddenAt >= 0 && now - lastHiddenAt < windowMs
}
