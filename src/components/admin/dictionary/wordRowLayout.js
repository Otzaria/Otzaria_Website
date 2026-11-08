// הפריסה של שורה ברשימת המילים — משותפת לשורה, לכותרת העמודות ולשלד הטעינה (אותן עמודות, בלי קפיצה כשהשלד
// מתחלף). לפי רוחב הרשימה עצמה (container query), לא לפי רוחב המסך. מחרוזות מלאות — כדי ש-Tailwind ימצא אותן.
//
//   צר:   [בחירה] [המילה — כל השורה]                  [⋮]
//                 [3 משתמשים ⌄]          [אשר] [דלג]
//                 [רשימת המשתמשים — כשפתוחה]
//   רחב (@3xl, 48rem): [בחירה] [מילה] [משתמשים] [אשר] [דלג] [⋮]
//                      [רשימת המשתמשים — כשפתוחה]
//
// אזור הפעולות ברוחב קבוע (גם כשבמקומן "בטל" או "נוספה למילון") — כך השורה לא משנה גובה ולא מזיזה את מה שמתחתיה.

export const ROW_GRID = [
  'grid min-h-18 items-center gap-x-2',
  "grid-cols-[var(--touch-target)_minmax(0,1fr)_auto_var(--touch-target)] [grid-template-areas:'check_main_main_menu'_'._users_primary_primary'_'._detail_detail_detail']",
  "@3xl:min-h-14 @3xl:grid-cols-[var(--touch-target)_minmax(0,16rem)_minmax(0,1fr)_13.5rem_var(--touch-target)] @3xl:[grid-template-areas:'check_main_users_primary_menu'_'._detail_detail_detail_detail']",
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'

export const AREA_CHECK = '[grid-area:check] self-start @3xl:self-center'
export const AREA_MAIN = '[grid-area:main] min-w-0 pt-2.5 @3xl:py-2'
export const WORD_TEXT = 'text-title-md text-on-surface [overflow-wrap:anywhere] @3xl:truncate'
export const AREA_USERS = '[grid-area:users] flex min-w-0 items-center gap-2 py-1'
export const AREA_PRIMARY = '[grid-area:primary] flex min-h-(--touch-target) items-center justify-end gap-1'
export const AREA_MENU = '[grid-area:menu] self-start @3xl:self-center'
export const AREA_DETAIL = '[grid-area:detail] min-w-0'
