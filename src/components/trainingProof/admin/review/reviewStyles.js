// המחלקות של שורה בסקירה (זיהוי טקסט ונתב הכתב) — כרטיס בלי צל ומסגרת. השורה הנוכחית (מקשים) — טבעת פנימית,
// והמסומנת — משטח "נבחר"; שתיהן לא משנות את גודל השורה, כך ששום דבר לא זז.
import { cx } from '@/components/ui/cx'

export function rowClasses({ selected = false, current = false } = {}) {
  return cx(
    'grid scroll-mt-32 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-3 rounded-(--radius-card) p-3 transition-colors sm:p-4 md:grid-cols-[auto_minmax(0,1fr)_auto]',
    selected ? 'bg-surface-selected' : 'bg-surface',
    current && 'ring-2 ring-inset ring-primary'
  )
}

/** שורת הפרטים בראש השורה (תגים, מי ומתי) */
export const ROW_META = 'flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-on-surface-variant [overflow-wrap:anywhere]'
/** עמודת הפעולות: בטלפון שורה מתחת לתוכן, מ-md עמודה בצד */
export const ROW_ACTIONS = 'col-span-2 flex flex-wrap items-center gap-1 md:col-span-1 md:flex-col md:items-stretch'
/** תווית בטבלת "המודל: / המתנדב:" */
export const ROW_LABEL = 'text-label-md text-on-surface-variant'
/** כפתור "דחה" בשורה — אדום ואחרון */
export const REJECT = 'text-error'
