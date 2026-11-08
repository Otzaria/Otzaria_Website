'use client'

import { useId, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from './AppIcon'
import { cx } from './cx'
import { FOCUS_RING_INSET } from './focusRing'
import { useDialogA11y } from './useDialogA11y'
import { usePortalContainer } from './portalContainer'

/**
 * מגירת פרטים של פריט ברשימה — נפתחת מצד הסוף (שמאל ב-RTL; הסרגל בצד ההתחלה), מעל רקע מעומעם.
 * במחשב ברוחב עד 38rem, בטלפון — ברוחב מלא (בלי גלילה אופקית).
 *
 * מבנה: ראש קבוע (כותרת, שורת משנה, סגירה, ומתחת — header, למשל לשוניות), גוף נגלל, ו-footer קבוע
 * אופציונלי. נגישות (useDialogA11y, כמו ui/Dialog): role="dialog" + aria-modal + aria-labelledby, הפוקוס
 * נלכד במגירה, Esc ולחיצה על הרקע סוגרים, גלילת הדף ננעלת, והפוקוס חוזר למי שפתח (או ל-returnFocus —
 * כשהכפתור שפתח כבר לא קיים). בלי inert על שאר הדף בכוונה: ההודעות הקופצות ("בטל") נשארות לחיצות.
 * בלי אנימציית יציאה — סגירה מיידית (גם ב"אחורה" של הדפדפן, שסוגר דרך הכתובת).
 *
 * @param {{ title: import('react').ReactNode, subtitle?: import('react').ReactNode, onClose: () => void,
 *   children: import('react').ReactNode, header?: import('react').ReactNode, footer?: import('react').ReactNode,
 *   leading?: import('react').ReactNode, dismissible?: boolean, wide?: boolean,
 *   returnFocus?: import('./useDialogA11y').DialogReturnFocus, className?: string, bodyClassName?: string }} props
 * leading — אלמנט לפני הכותרת (תמונה ממוזערת). dismissible=false — רק פעולה מפורשת סוגרת.
 * wide — מגירה רחבה (עד 96rem) לתוכן שצריך שתי תמונות זו ליד זו (סקירת הגשה בצורת הדף); בטלפון — כמו תמיד, ברוחב מלא.
 */
const noop = () => () => {}
// false ברינדור בשרת ובמעבר ה-hydration, true אחריו — כמו ב-Toast
const useMounted = () => useSyncExternalStore(noop, () => true, () => false)

export default function Drawer(props) {
  const container = usePortalContainer()
  // מגירה שפתוחה כבר בטעינה (קישור ישיר ?book=…) — רק אחרי ה-hydration, כדי שהשרת והדפדפן יתאימו
  const mounted = useMounted()
  if (!container || !mounted) return null
  return <DrawerPanel {...props} container={container} />
}

function DrawerPanel({ title, subtitle, onClose, children, header, footer, leading, dismissible = true, wide = false, returnFocus, className, bodyClassName, container }) {
  const titleId = useId()
  const subtitleId = useId()
  const panelRef = useRef(null)
  const dismiss = () => { if (dismissible) onClose() }
  useDialogA11y(panelRef, dismiss, { escapeEnabled: dismissible, returnFocus })

  return createPortal(
    <div className="fixed inset-0 z-(--dialog-z)">
      <div
        aria-hidden="true"
        onClick={dismiss}
        className="absolute inset-0 bg-(--dialog-scrim) animate-[enter-fade_var(--motion-duration-standard)_var(--ease-enter)_backwards] motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={cx(
          'absolute inset-y-0 end-0 flex w-full flex-col bg-background shadow-(--dialog-shadow) outline-none',
          wide ? 'sm:w-[min(96rem,calc(100vw-3rem))]' : 'sm:w-[min(38rem,calc(100vw-3rem))]',
          'animate-[enter-drawer-end_var(--motion-duration-emphasis)_var(--ease-enter)_backwards]',
          'motion-reduce:animate-[enter-fade_var(--motion-duration-standard)_var(--ease-enter)_backwards]',
          className
        )}
      >
        <div className="shrink-0 border-b border-outline-variant">
          <div className="flex items-start gap-3 ps-4 pe-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:ps-6">
            {leading}
            <div className="min-w-0 flex-1 pt-1.5">
              <h2 id={titleId} className="text-title-lg break-words text-on-surface">{title}</h2>
              {subtitle && <div id={subtitleId} className="mt-1 text-body-sm text-on-surface-variant">{subtitle}</div>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="סגירה"
                className={cx(
                  'flex size-12 shrink-0 items-center justify-center rounded-(--radius-control) text-on-surface-variant transition-colors hover:bg-surface-selected hover:text-on-surface',
                  FOCUS_RING_INSET
                )}
              >
                <AppIcon name="close" className="text-icon-xl" />
              </button>
            )}
          </div>
          {header}
        </div>

        <div className={cx('custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6', bodyClassName)}>
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-outline-variant px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    container
  )
}
