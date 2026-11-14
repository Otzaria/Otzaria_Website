// הפריסה של שורה ברשימת ההעלאות — משותפת לשורת ספר, לשורת קובץ בתוכו ולשלד הטעינה, כדי
// שכולם יהיו באותן עמודות ושלא תהיה קפיצה כשהשלד מתחלף בתוכן.
//
// לפי רוחב הרשימה עצמה (container query, @container על הרשימה) ולא לפי רוחב המסך — ליד הסרגל
// במחשב הרשימה צרה מהמסך.
//   צר (טלפון):        [בחירה] [▸ ספר + פרטים] [⋮]
//                      [      ] [מצב ········· פעולה]   ← הפעולה תמיד בקצה, באותה שורה
//   רחב (@2xl, 42rem): [בחירה] [▸ ספר + פרטים] [מצב] [פעולה] [⋮]   — פעולה בתווית קצרה ("הורד (91)")
//   רחב מאוד (@4xl, 56rem): אותו דבר, עמודות רחבות יותר ותווית מלאה
// העמודות שבסוף ברוחב קבוע, כך שהן מיושרות בין השורות. "controls" עוטף את המצב והפעולה: בצר —
// שורה משלו (גריד של שתי עמודות); ברחב — display: contents, והילדים יושבים ישירות בעמודות שלהם.
//
// אין חץ בתחילת השורה: תיבת הבחירה ומיד אחריה שם הספר — באותו קו בדיוק בכל השורות (עם קובץ אחד
// או עם כמה, גם באשפה). הפתיחה של ספר עם כמה קבצים — בשורת הפרטים ("91 עמודים ▾", ExpandToggle).
//
// מחרוזות מלאות (לא מורכבות) — כדי ש-Tailwind ימצא אותן בסריקה.

export const ROW_GRID = [
  'grid min-h-16 items-center gap-x-2 gap-y-1',
  "grid-cols-[var(--touch-target)_minmax(0,1fr)_var(--touch-target)] [grid-template-areas:'check_book_menu'_'._controls_controls']",
  "@2xl:grid-cols-[var(--touch-target)_minmax(0,1fr)_10rem_7.5rem_var(--touch-target)] @2xl:[grid-template-areas:'check_book_status_primary_menu']",
  '@4xl:grid-cols-[var(--touch-target)_minmax(0,1fr)_14rem_10.5rem_var(--touch-target)]',
].join(' ')

/** באשפה אין עמודת מצב */
export const TRASH_ROW_GRID = [
  'grid min-h-16 items-center gap-x-2 gap-y-1',
  "grid-cols-[var(--touch-target)_minmax(0,1fr)_var(--touch-target)] [grid-template-areas:'check_book_menu'_'._controls_controls']",
  "@2xl:grid-cols-[var(--touch-target)_minmax(0,1fr)_7.5rem_var(--touch-target)] @2xl:[grid-template-areas:'check_book_primary_menu']",
  '@4xl:grid-cols-[var(--touch-target)_minmax(0,1fr)_10.5rem_var(--touch-target)]',
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'

export const AREA_CHECK = '[grid-area:check] self-start @2xl:self-center'
export const AREA_BOOK = '[grid-area:book] min-w-0 py-2'
export const AREA_MENU = '[grid-area:menu] self-start @2xl:self-center'
export const AREA_CONTROLS = '[grid-area:controls] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pb-2 @2xl:contents'
export const AREA_STATUS = '@2xl:[grid-area:status] flex min-w-0 justify-start'
export const AREA_PRIMARY = '@2xl:[grid-area:primary] flex justify-end'

/** כמה העלאות מוצגות בתוך ספר פתוח לפני "הצג עוד" */
export const ITEMS_STEP = 50
