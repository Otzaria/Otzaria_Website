// הפריסה של שורה ברשימת הספרים — משותפת לשורה ולשלד הטעינה, כדי שיהיו באותן עמודות ושלא תהיה
// קפיצה כשהשלד מתחלף בתוכן. לפי רוחב הרשימה עצמה (container query), לא לפי רוחב המסך.
//
//   צר (טלפון):        [בחירה] [כריכה] [שם + פרטים] [פתח] [⋮]
//                      [      ] [      ] [109/168 · 19 בעבודה ▬▬▬▬▬▬]   ← שורת התקדמות אחת וקצרה
//   (כך שורה בטלפון היא כ-90px — כמה ספרים במסך, ולא שלושה)
//   רחב (@2xl, 42rem): [בחירה] [כריכה] [שם + פרטים] [התקדמות] [פתח] [⋮]
//   רחב מאוד (@4xl):   אותו דבר, עמודת התקדמות רחבה יותר
//
// הכריכה ברוחב קבוע, כך שכל השמות מתחילים באותו קו בדיוק — גם כשאין תמונה (ממלא מקום באותה מידה).
// מחרוזות מלאות (לא מורכבות) — כדי ש-Tailwind ימצא אותן בסריקה.

export const ROW_GRID = [
  'grid min-h-18 items-center gap-x-2 gap-y-1',
  "grid-cols-[var(--touch-target)_2.25rem_minmax(0,1fr)_auto_var(--touch-target)] [grid-template-areas:'check_thumb_book_primary_menu'_'._._progress_progress_progress']",
  "@2xl:grid-cols-[var(--touch-target)_2.25rem_minmax(0,1fr)_11rem_5rem_var(--touch-target)] @2xl:[grid-template-areas:'check_thumb_book_progress_primary_menu']",
  '@4xl:grid-cols-[var(--touch-target)_2.25rem_minmax(0,1fr)_15rem_5.5rem_var(--touch-target)]',
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'

export const AREA_CHECK = '[grid-area:check] self-start @2xl:self-center'
export const AREA_THUMB = '[grid-area:thumb] self-start pt-2 @2xl:self-center @2xl:pt-0'
export const AREA_BOOK = '[grid-area:book] min-w-0 py-1.5 @2xl:py-2'
export const AREA_MENU = '[grid-area:menu] self-start @2xl:self-center'
export const AREA_CONTROLS = 'contents'
export const AREA_PROGRESS = '[grid-area:progress] min-w-0 pb-2 @2xl:pb-0'
export const AREA_PRIMARY = '[grid-area:primary] flex justify-end self-start @2xl:self-center'
