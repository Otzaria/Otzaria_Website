// מיקום הרשימה של ui/SelectMenu ליד הכפתור — לוגיקה טהורה (selectMenuGeometry.test.js).
//
// מתחת לכפתור, ומעליו כשלמטה אין מספיק מקום (ולמעלה יש יותר). מיושרת לקצה ההתחלה של הכפתור
// (ב-RTL — הימני), ברוחב הכפתור לפחות, ותמיד בתוך המסך. הגובה המרבי — המקום שנשאר בצד שנבחר,
// והרשימה נגללת בתוכה.

/** מרווח מקצות המסך */
export const MENU_MARGIN = 8
/** בין הכפתור לרשימה */
export const MENU_GAP = 4
/** מתחת לזה למטה — עדיף למעלה (אם שם יש יותר) */
export const MENU_MIN_HEIGHT = 200

/**
 * @param {{ trigger: { top: number, bottom: number, left: number, right: number, width: number },
 *   menu: { width: number, height: number }, viewport: { width: number, height: number },
 *   rtl?: boolean, minWidth?: number, maxWidth?: number, maxHeight?: number }} args
 * maxHeight — תקרת גובה לרשימה (גם כשיש מקום)
 * @returns {{ left: number, top: number, width: number, maxHeight: number, placement: 'below' | 'above' }}
 */
export function placeMenu({ trigger, menu, viewport, rtl = true, minWidth = 0, maxWidth = Infinity, maxHeight: cap = Infinity }) {
  const width = Math.min(Math.max(trigger.width, minWidth, menu.width), maxWidth, viewport.width - MENU_MARGIN * 2)
  const preferred = rtl ? trigger.right - width : trigger.left
  const left = Math.round(Math.min(Math.max(MENU_MARGIN, preferred), viewport.width - width - MENU_MARGIN))

  const natural = Math.min(menu.height, cap)
  const below = viewport.height - trigger.bottom - MENU_GAP - MENU_MARGIN
  const above = trigger.top - MENU_GAP - MENU_MARGIN
  const fitsBelow = below >= Math.min(natural, MENU_MIN_HEIGHT)
  const placement = fitsBelow || below >= above ? 'below' : 'above'
  const maxHeight = Math.max(0, Math.floor(Math.min(cap, placement === 'below' ? below : above)))
  const height = Math.min(natural, maxHeight)
  const top = Math.round(placement === 'below' ? trigger.bottom + MENU_GAP : trigger.top - MENU_GAP - height)
  return { left, top, width: Math.round(width), maxHeight, placement }
}
