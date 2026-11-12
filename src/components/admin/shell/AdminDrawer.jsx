'use client'

import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING_INSET } from '@/components/ui/focusRing'
import { useDialogA11y } from '@/components/ui/useDialogA11y'
import { useInertBackground } from '@/components/ui/useInertBackground'

/**
 * מגירת הניהול בטלפון — הסרגל עצמו, נפתח מצד ההתחלה (ימין ב-RTL) מעל ה-scrim.
 * הנגישות מ-useDialogA11y (כמו ui/Dialog): role="dialog" + aria-modal, לכידת פוקוס, Esc
 * סוגר, גלילת הדף ננעלת והפוקוס חוזר לכפתור שפתח; שאר הדף inert בזמן שהמגירה פתוחה. לחיצה על הרקע סוגרת. הסגירה במעבר עמוד
 * נעשית בהורה (AdminShell): המגירה פתוחה רק לכתובת שבה נפתחה.
 * בלי אנימציית יציאה בכוונה — סגירה מיידית, כדי שמעבר עמוד לא ימתין לה.
 */
export default function AdminDrawer({ title, onClose, children }) {
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const titleId = useId()
  // לפני useDialogA11y — כדי שהרקע ישתחרר לפני שהפוקוס חוזר לכפתור (ראו useInertBackground)
  useInertBackground(rootRef)
  useDialogA11y(panelRef, onClose)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-(--dialog-z) xl:hidden">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-(--dialog-scrim) animate-[enter-fade_var(--motion-duration-standard)_var(--ease-enter)_backwards]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'absolute inset-y-0 start-0 flex w-(--admin-drawer-width) flex-col bg-background shadow-(--dialog-shadow) outline-none',
          'animate-[enter-drawer-start_var(--motion-duration-emphasis)_var(--ease-enter)_backwards]',
          'motion-reduce:animate-[enter-fade_var(--motion-duration-standard)_var(--ease-enter)_backwards]'
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-2 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))]">
          {/* "ניהול" — שקט, כמו בראש הסרגל במחשב (שם התפקיד — בתחתית, ליד "חזרה לאזור האישי") */}
          <h2 id={titleId} className="min-w-0 px-3 text-label-md text-on-surface-variant">{title}</h2>
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
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
