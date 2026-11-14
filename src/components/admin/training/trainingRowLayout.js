// הפריסה של שורה ברשימת "עמודים לאימון" — משותפת לשורה, לכותרת העמודות ולשלד הטעינה (אותן עמודות, בלי קפיצה).
// לפי רוחב הרשימה עצמה (container query). מחרוזות מלאות — כדי ש-Tailwind ימצא אותן.
//
//   צר:   [בחירה] [שם הספר — נשבר]                          [⋮]
//                 [עמוד 12 · מרובע · פנוי · 3/10 שורות]  [פתח]
//                 [בעבודה אצל משה]
//   רחב (@4xl): [בחירה] [ספר] [עמוד] [כתב] [מצב] [שורות] [מתנדב] [עודכן] [פתח] [⋮]

export const ROW_GRID = [
  'grid min-h-18 items-center gap-x-2',
  "grid-cols-[var(--touch-target)_minmax(0,1fr)_auto_var(--touch-target)] [grid-template-areas:'check_main_main_menu'_'._sub_open_open']",
  "@4xl:min-h-14 @4xl:grid-cols-[var(--touch-target)_minmax(0,1fr)_4rem_4.5rem_6.5rem_5.5rem_minmax(0,9rem)_6.5rem_4.5rem_var(--touch-target)] @4xl:[grid-template-areas:'check_main_number_script_status_lines_user_added_open_menu']",
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'

export const AREA_CHECK = '[grid-area:check] self-start @4xl:self-center'
export const AREA_MAIN = '[grid-area:main] min-w-0 pt-2.5 @4xl:py-2'
export const BOOK_NAME = 'relative text-title-sm text-on-surface break-words @4xl:truncate'
export const AREA_SUB = '[grid-area:sub] flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 py-1 text-body-sm text-on-surface-variant @4xl:hidden'
export const AREA_NUMBER = '[grid-area:number] hidden text-body-md tabular-nums text-on-surface @4xl:block'
export const AREA_SCRIPT = '[grid-area:script] hidden @4xl:block'
export const AREA_STATUS = '[grid-area:status] hidden @4xl:block'
export const AREA_LINES = '[grid-area:lines] hidden text-body-sm tabular-nums @4xl:block'
export const AREA_USER = '[grid-area:user] hidden min-w-0 truncate text-body-sm text-on-surface @4xl:block'
export const AREA_ADDED = '[grid-area:added] hidden min-w-0 truncate text-body-sm text-on-surface-variant @4xl:block'
export const AREA_OPEN = '[grid-area:open] flex min-h-(--touch-target) items-center justify-end'
export const AREA_MENU = '[grid-area:menu] self-start @4xl:self-center'
