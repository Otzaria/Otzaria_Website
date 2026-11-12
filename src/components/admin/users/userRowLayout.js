// הפריסה של שורה ברשימת המשתמשים — משותפת לשורה, לכותרת העמודות ולשלד הטעינה (אותן עמודות, בלי קפיצה
// כשהשלד מתחלף). לפי רוחב הרשימה עצמה (container query), לא לפי רוחב המסך. מחרוזות מלאות — כדי ש-Tailwind
// ימצא אותן.
//
//   צר:   [שם / דואר] [פתח] [⋮]
//         [תפקיד · צוותים — כל רוחב השורה, שורה אחת שלא נשברת]
//         [מונים — שורה אחת]
//   רחב (@4xl, 56rem): [שם + דואר] [תפקיד] [צוותים] [נקודות] [עמודים שהושלמו] [הצטרף] [פתח] [⋮]
//
// בכל רוחב, כל פריט בשורה אחת (שם ארוך נחתך, והשם המלא ב-title ובמגירה; צוותים שלא נכנסים — "+1") — כך
// שגובה השורה קבוע. אין עמודת בחירה ואין תמונה — השם מתחיל בקצה השורה.

export const ROW_GRID = [
  'grid min-h-18 items-center gap-x-3',
  "grid-cols-[minmax(0,1fr)_auto_var(--touch-target)] [grid-template-areas:'main_primary_menu'_'sub_sub_sub']",
  "@4xl:grid-cols-[minmax(0,1fr)_8.5rem_11rem_4.5rem_5rem_5.5rem_4.5rem_var(--touch-target)] @4xl:[grid-template-areas:'main_role_teams_points_pages_joined_primary_menu']",
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'

export const AREA_MAIN = '[grid-area:main] min-w-0 pt-2.5 ps-2 sm:ps-3 @4xl:py-2.5'
/** שורות המשנה ברשימה צרה — לכל רוחב השורה, מתחת לשם ול"פתח" */
export const AREA_SUB = '[grid-area:sub] min-w-0 pb-2.5 ps-2 sm:ps-3 @4xl:hidden'
export const AREA_ROLE = '[grid-area:role] hidden min-w-0 @4xl:block'
export const AREA_TEAMS = '[grid-area:teams] hidden min-w-0 @4xl:block'
export const AREA_POINTS = '[grid-area:points] hidden min-w-0 truncate text-body-sm tabular-nums text-on-surface @4xl:block'
export const AREA_PAGES = '[grid-area:pages] hidden min-w-0 truncate text-body-sm tabular-nums text-on-surface @4xl:block'
export const AREA_JOINED = '[grid-area:joined] hidden text-body-sm text-on-surface-variant @4xl:block'
export const AREA_PRIMARY = '[grid-area:primary] flex justify-end'
export const AREA_MENU = '[grid-area:menu]'

/** גובה שורת התגים ברשימה צרה — קבוע, גם כשאין בה כלום (משתמש רגיל בלי צוות) */
export const TAGS_LINE = 'mt-1.5 h-6'
