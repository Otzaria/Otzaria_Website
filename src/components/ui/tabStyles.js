import { cx } from './cx'
import { FOCUS_RING_INSET } from './focusRing'

/**
 * מראה לשונית — משותף ל-ui/Tabs (לשוניות בתוך אזור) ול-ui/TabLinks (ניווט בין עמודים), כדי ששתיהן
 * ייראו אותו דבר תמיד: מטרת מגע 44px, פס primary בתחתית הפעילה (לא בצבע בלבד; ב-forced-colors —
 * Highlight), וריחוף שקט בשאר. בטלפון ריפוד צר (px-2), כדי שארבע לשוניות עם מונים ייכנסו גם ב-360.
 * @param {boolean} active
 */
export function tabClasses(active) {
  return cx(
    'relative flex min-h-(--touch-target) items-center gap-2 rounded-t-(--radius-control) px-3 text-label-lg whitespace-nowrap transition-colors max-sm:px-2 sm:px-4',
    'after:absolute after:inset-x-2 after:bottom-0 after:h-(--indicator-thickness) after:rounded-t-(--radius-pill) after:bg-primary after:opacity-0 after:transition-opacity',
    active
      ? 'text-primary after:opacity-100 forced-colors:after:bg-[Highlight]'
      : 'text-on-surface-variant hover:bg-surface-selected hover:text-on-surface',
    FOCUS_RING_INSET
  )
}
