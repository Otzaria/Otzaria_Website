// הפריסה של שורה ברשימות "הודעות" — משותפת לשורה ולשלד הטעינה (אותן עמודות ואותו גובה, בלי קפיצה כשהשלד
// מתחלף). לפי רוחב הרשימה עצמה (container query), לא לפי רוחב המסך. מחרוזות מלאות — כדי ש-Tailwind ימצא אותן.
//
// נכנסות:
//   צר:   [בחירה] [שולח · חדש ……… זמן / נושא — קטע] [⋮]
//   רחב:  [בחירה] [שולח · חדש / נושא — קטע] [זמן] [סמן כנקרא · פתח] [⋮]
// ("סמן כנקרא" — אייקון גלוי רק בשורה חדשה, במקום שמור בכל שורה: העמודות לא זזות. ברשימה צרה — ב-⋮.)
// נשלחו (בלי בחירה — אין פעולה מרובה):
//   צר:   [אל … ……… זמן / נושא — קטע] [⋮]
//   רחב:  [אל … / נושא — קטע] [זמן] [פתח] [⋮]
// בכל רוחב שתי שורות טקסט, כל אחת בשורה אחת (ארוך — נחתך) — כך שגובה השורה קבוע, ותג "חדש" לא מזיז דבר:
// הוא אחרי השם, לא לפניו.

export const INBOX_ROW_GRID = [
  'grid min-h-18 items-center gap-x-2',
  "grid-cols-[var(--touch-target)_minmax(0,1fr)_var(--touch-target)] [grid-template-areas:'check_main_menu']",
  "@3xl:grid-cols-[var(--touch-target)_minmax(0,1fr)_6.5rem_7rem_var(--touch-target)] @3xl:[grid-template-areas:'check_main_time_primary_menu']",
].join(' ')

export const SENT_ROW_GRID = [
  'grid min-h-18 items-center gap-x-2',
  "grid-cols-[minmax(0,1fr)_var(--touch-target)] [grid-template-areas:'main_menu']",
  "@3xl:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_var(--touch-target)] @3xl:[grid-template-areas:'main_time_primary_menu']",
].join(' ')

export { ROW_PADDING } from '@/components/admin/list/listLayout'

export const AREA_CHECK = '[grid-area:check]'
export const AREA_MAIN = '[grid-area:main] min-w-0 py-2.5'
/** בנשלחו אין עמודת בחירה — ריווח קטן מהקצה, כמו במשתמשים */
export const AREA_MAIN_SENT = '[grid-area:main] min-w-0 py-2.5 ps-2 sm:ps-3'
/** הזמן כעמודה — רק ברשימה רחבה (בצרה הוא בסוף השורה הראשונה) */
export const AREA_TIME = '[grid-area:time] hidden text-body-sm text-on-surface-variant @3xl:block'
/** הזמן בתוך השורה הראשונה — רק ברשימה צרה */
export const TIME_INLINE = 'shrink-0 text-body-sm text-on-surface-variant @3xl:hidden'
export const AREA_PRIMARY = '[grid-area:primary] hidden items-center justify-end gap-1 @3xl:flex'
export const AREA_MENU = '[grid-area:menu]'

/** השם בשורה: כפתור שפותח את השיחה, שנראה כמו טקסט; מטרת מגע 44px בלי להגדיל את השורה */
/**
 * השורה השנייה (נושא — קטע): נחתכת בסוף גם כשאין בה רווחים (קישור מודבק כנושא). relative — כדי שה-sr-only שבתוכה
 * (absolute) ייחתך איתה: בלי זה הוא נמדד מאב רחוק, יושב אחרי הנושא הארוך — ומרחיב את כל הדף לרוחב.
 */
export const ROW_SECOND_LINE = 'relative mt-0.5 min-w-0 truncate text-body-sm'

export const ROW_OPEN = 'flex min-w-0 max-w-full cursor-pointer rounded-(--radius-control) text-start outline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary'
