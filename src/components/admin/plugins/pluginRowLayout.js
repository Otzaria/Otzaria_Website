// הפריסה של שורה ברשימות התוספים — משותפת לשורה ולשלד הטעינה (אותן עמודות, בלי קפיצה כשהשלד מתחלף).
// לפי רוחב הרשימה עצמה (container query), לא לפי רוחב המסך. מחרוזות מלאות — כדי ש-Tailwind ימצא אותן.
//
// "לאישור" (בלי בחירה — אין פעולה מרובה על הגשות):
//   צר:   [תמונה] [שם + פרטים] [פתח] [⋮]        (גרסה ומתי הוגש — בשתי שורות קבועות)
//   רחב:  [תמונה] [שם + פרטים] [אשר · דחה] [⋮]
// "בחנות":
//   צר:   [בחירה] [תמונה] [שם + פרטים] [⋮]             (הורדות ודירוג בשורה אחת; לחיצה על השם פותחת)
//   רחב:  [בחירה] [תמונה] [שם + פרטים] [הורדות · דירוג] [פתח] [⋮]
// התמונה ברוחב קבוע, כך שכל השמות מתחילים באותו קו — גם כשאין תמונה (ממלא מקום באותה מידה).

export const PENDING_ROW_GRID = [
  'grid min-h-18 items-center gap-x-3',
  "grid-cols-[2.5rem_minmax(0,1fr)_auto_var(--touch-target)] [grid-template-areas:'thumb_main_primary_menu']",
  '@2xl:grid-cols-[2.5rem_minmax(0,1fr)_auto_var(--touch-target)]',
].join(' ')

export const STORE_ROW_GRID = [
  'grid min-h-18 items-center gap-x-2',
  "grid-cols-[var(--touch-target)_2.5rem_minmax(0,1fr)_auto_var(--touch-target)] [grid-template-areas:'check_thumb_main_primary_menu']",
  "@2xl:grid-cols-[var(--touch-target)_2.5rem_minmax(0,1fr)_10rem_4.5rem_var(--touch-target)] @2xl:[grid-template-areas:'check_thumb_main_stats_primary_menu']",
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'
/** שם התוסף בשורה: כפתור שפותח את המגירה, שנראה כמו טקסט */
export const ROW_NAME = 'cursor-pointer rounded-(--radius-control) text-start break-words outline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary'
export const AREA_CHECK = '[grid-area:check]'
export const AREA_THUMB = '[grid-area:thumb]'
export const AREA_MAIN = '[grid-area:main] min-w-0 py-2'
export const AREA_STATS = '[grid-area:stats] hidden @2xl:block'
export const AREA_PRIMARY = '[grid-area:primary] flex justify-end gap-1'
export const AREA_MENU = '[grid-area:menu]'
