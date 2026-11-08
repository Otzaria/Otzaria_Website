// הפריסה של שורה ברשימת העמודים — משותפת לשורה, לכותרת העמודות ולשלד הטעינה (אותן עמודות, בלי קפיצה כשהשלד
// מתחלף). לפי רוחב הרשימה עצמה (container query), לא לפי רוחב המסך. מחרוזות מלאות — כדי ש-Tailwind ימצא אותן.
//
//   צר:   [בחירה] [שם הספר — כל השורה, נשבר לשתי שורות כמו ב"ספרים"]   [⋮]
//                 [עמוד 12 · בעבודה · לפני 12 ימים · משה כהן]  [שחרר — עד הקצה]
//   רחב (@4xl, 56rem): [בחירה] [ספר] [עמוד] [מצב] [משתמש] [עודכן] [שחרר] [⋮]
//
// ברשימה צרה "שחרר" בשורה השנייה, כדי ששם הספר יקבל את כל השורה העליונה; אזור "שחרר" בגובה כפתור גם כשאין בו
// כפתור — כך שכל השורות באותו גובה, ושורה ש"שחרר" שלה מתחלף ב"שוחרר" לא מתקצרת (ולא מזיזה את מה שמתחתיה).
// ברוחב: כל פריט בשורה אחת (שם ארוך נחתך, המלא ב-title), ועמודת "שחרר" ברוחב קבוע גם בשורה שאין בה שחרור.

export const ROW_GRID = [
  'grid min-h-18 items-center gap-x-2',
  "grid-cols-[var(--touch-target)_minmax(0,1fr)_auto_var(--touch-target)] [grid-template-areas:'check_main_main_menu'_'._sub_primary_primary']",
  "@4xl:min-h-14 @4xl:grid-cols-[var(--touch-target)_minmax(0,1fr)_4.5rem_6rem_minmax(0,11rem)_7.5rem_5.5rem_var(--touch-target)] @4xl:[grid-template-areas:'check_main_number_status_user_updated_primary_menu']",
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'

export const AREA_CHECK = '[grid-area:check] self-start @4xl:self-center'
export const AREA_MAIN = '[grid-area:main] min-w-0 pt-2.5 @4xl:py-2'
/** שם הספר: ברשימה צרה נשבר (גם מילה ארוכה בלי רווחים); ברוחב — שורה אחת */
export const BOOK_NAME = 'text-title-sm text-on-surface break-words @4xl:truncate'
/** שורת הפרטים ברשימה צרה — מתחת לשם */
export const AREA_SUB = '[grid-area:sub] flex min-w-0 items-center gap-1.5 py-1 @4xl:hidden'
export const AREA_NUMBER = '[grid-area:number] hidden text-body-md tabular-nums text-on-surface @4xl:block'
export const AREA_STATUS = '[grid-area:status] hidden @4xl:block'
export const AREA_USER = '[grid-area:user] hidden min-w-0 truncate text-body-sm text-on-surface @4xl:block'
export const AREA_UPDATED = '[grid-area:updated] hidden min-w-0 truncate text-body-sm text-on-surface-variant @4xl:block'
export const AREA_PRIMARY = '[grid-area:primary] flex min-h-(--touch-target) items-center justify-end'
export const AREA_MENU = '[grid-area:menu] self-start @4xl:self-center'
