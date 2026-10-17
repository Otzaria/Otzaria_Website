'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { prefersReducedMotion } from '@/lib/reducedMotion'
import TitleOrnament from './TitleOrnament'
import { cx } from './cx'
import { FOCUS_RING_INSET } from './focusRing'
import { useDialogA11y } from './useDialogA11y'

// היציאה (--motion-duration-fast) קצרה מעט מהכניסה (--motion-duration-standard) — כמו במתקין.
// החלון מוסר ב-animationend של אנימציית היציאה, כך שהמשך נקבע רק בטוקן שב-CSS. זו רשת ביטחון
// בלבד, למקרה שהאירוע לא מגיע (האנימציה בוטלה, הלשונית ברקע) — ארוכה בהרבה מכל משך סביר.
const EXIT_FALLBACK_MS = 600

const ENTER_SCRIM = 'animate-[enter-fade_var(--motion-duration-standard)_var(--ease-enter)_backwards]'
const EXIT_SCRIM = 'animate-[enter-fade_var(--motion-duration-fast)_var(--ease-exit)_reverse_forwards]'
const ENTER_PANEL = 'animate-[enter-up_var(--motion-duration-standard)_var(--ease-enter)_backwards]'
const EXIT_PANEL = 'animate-[enter-up_var(--motion-duration-fast)_var(--ease-exit)_reverse_forwards]'

/**
 * חלון מודאלי בשפת מסכי המתקין: כותרת ממורכזת עם קישוט זהב, גוף ברקע הדף.
 * בנייד (<640px) — גיליון תחתון (bottom sheet) ברוחב מלא עם ידית; מ-sm — חלון ממורכז
 * (--dialog-width). הכותרת קבועה, והגוף נגלל בתוכה כשהתוכן ארוך; footer — שורת פעולות קבועה.
 *
 * נגישות (useDialogA11y): role="dialog" + aria-modal + aria-labelledby (ו-aria-describedby
 * לשורת המשנה), פוקוס נכנס לחלון ונלכד בו, Esc ולחיצה על הרקע סוגרים, גלילת הדף ננעלת,
 * והפוקוס חוזר למי שפתח. בפורטל ל-body — מעל כל הקשר ערמה (גם הכותרת הדביקה).
 *
 * שימוש: ההורה מרנדר את הרכיב רק כשהחלון פתוח, ומסיר אותו ב-onClose. היציאה המונפשת
 * מתבצעת כאן: הסגירה מריצה את אנימציית היציאה ורק אחריה קוראת ל-onClose.
 * (ui/Modal הישן — isOpen + buttons — נשאר לצרכנים הקיימים בעורכים ובניהול; ראו design-system.md.)
 */
export default function Dialog({ title, subtitle, onClose, children, footer, dismissible = true, className, bodyClassName }: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** false — רק פעולה מפורשת סוגרת (בלי Esc, בלי לחיצה על הרקע ובלי כפתור הסגירה) */
  dismissible?: boolean
  className?: string
  bodyClassName?: string
}) {
  const titleId = useId()
  const subtitleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closedRef = useRef(false)

  // onClose פעם אחת בלבד — גם אם גם animationend וגם רשת הביטחון מגיעים
  const finishClose = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    onClose()
  }, [onClose])

  const requestClose = useCallback(() => {
    if (timerRef.current || closedRef.current) return
    if (prefersReducedMotion(true)) {
      onClose()
      return
    }
    setClosing(true)
    timerRef.current = setTimeout(finishClose, EXIT_FALLBACK_MS)
  }, [onClose, finishClose])

  // סוף אנימציית היציאה של החלון עצמו (לא של צאצא שהאירוע שלו מבעבע אליו). מאזין native ולא
  // onAnimationEnd של React: React בוחר שם אירוע לפי זיהוי יכולות הדפדפן (בסביבה בלי
  // AnimationEvent — webkitAnimationEnd), וכך גם בדפדפן וגם בטסטים מאזינים לאותו animationend.
  useEffect(() => {
    const panel = panelRef.current
    if (!closing || !panel) return undefined
    const onAnimationEnd = (event: Event) => {
      if (event.target === panel) finishClose()
    }
    panel.addEventListener('animationend', onAnimationEnd)
    return () => panel.removeEventListener('animationend', onAnimationEnd)
  }, [closing, finishClose])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const dismiss = useCallback(() => { if (dismissible) requestClose() }, [dismissible, requestClose])
  useDialogA11y(panelRef, dismiss)

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-(--dialog-z) flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        onClick={dismiss}
        className={cx('absolute inset-0 bg-(--dialog-scrim) motion-reduce:animate-none', closing ? EXIT_SCRIM : ENTER_SCRIM)}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-(--dialog-sheet-radius) bg-(--dialog-bg) shadow-(--dialog-sheet-shadow) outline-none motion-reduce:animate-none',
          'sm:max-h-[min(85dvh,46rem)] sm:max-w-(--dialog-width) sm:rounded-(--dialog-radius) sm:shadow-(--dialog-shadow)',
          closing ? EXIT_PANEL : ENTER_PANEL,
          className
        )}
      >
        <DialogHeader titleId={titleId} subtitleId={subtitleId} title={title} subtitle={subtitle} onClose={dismissible ? requestClose : undefined} />

        <div className={cx('custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6', bodyClassName)}>
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-outline-variant px-4 py-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

function DialogHeader({ titleId, subtitleId, title, subtitle, onClose }: {
  titleId: string
  subtitleId: string
  title: ReactNode
  subtitle?: ReactNode
  onClose?: () => void
}) {
  return (
    <div className="relative shrink-0 px-14 pb-4 pt-3 text-center sm:pt-6">
      {/* ידית הגיליון — רמז חזותי בלבד בנייד */}
      <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-(--radius-pill) bg-outline-variant sm:hidden" />
      <h2 id={titleId} className="text-xl font-bold text-on-surface sm:text-2xl">{title}</h2>
      <TitleOrnament className="mt-3" ratio="45%" min="96px" />
      {subtitle && <p id={subtitleId} className="mt-3 text-sm text-on-surface-variant">{subtitle}</p>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="סגירה"
          className={cx(
            'absolute end-2 top-2 flex size-12 items-center justify-center rounded-(--radius-control) text-on-surface-variant transition-colors hover:bg-surface-selected hover:text-on-surface sm:end-3 sm:top-3',
            FOCUS_RING_INSET
          )}
        >
          <span aria-hidden="true" className="material-symbols-outlined text-2xl">close</span>
        </button>
      )}
    </div>
  )
}
