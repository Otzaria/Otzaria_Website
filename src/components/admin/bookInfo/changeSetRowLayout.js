// הפריסה של שורה ברשימת בקשות המיזוג — משותפת לשורה, לכותרת העמודות ולשלד הטעינה. לפי רוחב הרשימה (container
// query). מחרוזות מלאות — כדי ש-Tailwind ימצא אותן.
//
//   צר:   [ספר + מחבר]                         [#12 ב-GitHub]
//         [מצב · מתי · מי]
//         [השינויים]
//         [סיבה — כשיש]
//   רחב (@4xl, 56rem): [ספר] [השינויים] [מי ומתי] [מצב] [בקשה]
//                      [      הסיבה — כשיש            ]

export const ROW_GRID = [
  'grid items-start gap-x-3 py-3',
  "grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'main_link'_'sub_sub'_'changes_changes'_'error_error']",
  "@4xl:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,10rem)_9rem_7.5rem] @4xl:[grid-template-areas:'main_changes_who_status_link'_'._error_error_error_error']",
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'

export const AREA_MAIN = '[grid-area:main] min-w-0'
export const BOOK_NAME = 'text-title-sm text-on-surface [overflow-wrap:anywhere]'
export const AREA_SUB = '[grid-area:sub] mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-body-sm text-on-surface-variant @4xl:hidden'
export const AREA_CHANGES = '[grid-area:changes] mt-2 min-w-0 @4xl:mt-0'
export const AREA_WHO = '[grid-area:who] hidden min-w-0 text-body-sm @4xl:block'
export const AREA_STATUS = '[grid-area:status] hidden @4xl:block'
export const AREA_LINK = '[grid-area:link] flex justify-end'
export const AREA_ERROR = '[grid-area:error] min-w-0'
