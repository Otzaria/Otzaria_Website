'use client'

import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'

/**
 * הסרגל התחתון של העורך בנייד: שורה קודמת, שורה הבאה, הגדלה, כלים (חלון הפקודות), ותפוס/סיים.
 * מטרות מגע של 44px ומעלה; ריפוד לאזור הבטוח בתחתית (iPhone). סגנון "אוורירי וקל" כמו שורות הכלים:
 * אייקונים דקים (--tool-icon-weight) ותוויות במשקל רגיל, בצבע הרך של הכלים.
 * כפתורי השורה לא לוקחים פוקוס בלחיצה — הסמן נשאר ב-textarea.
 *
 * @param {{ onPrevLine: () => void, onNextLine: () => void, onZoom: () => void, onTools: () => void,
 *   onFinish: () => void, finishDisabled?: boolean, claimState?: string, onClaim?: () => void,
 *   className?: string }} props
 * claimState (pageClaim.js) — פנוי: "תפוס עמוד"; של המשתמש: "סיים"; אחרת — בלי פעולה ראשית.
 */
export default function MobileActionBar({ onPrevLine, onNextLine, onZoom, onTools, onFinish, finishDisabled = false, claimState = 'mine', onClaim, className }) {
  return (
    <nav
      aria-label="פעולות העורך"
      className={cx(
        'flex shrink-0 items-center gap-1 border-t border-outline-subtle bg-surface px-3 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]',
        className
      )}
    >
      <BarButton icon="arrow_upward" label="קודמת" ariaLabel="שורה קודמת" onClick={onPrevLine} keepFocus />
      <BarButton icon="arrow_downward" label="הבאה" ariaLabel="שורה הבאה" onClick={onNextLine} keepFocus />
      <BarButton icon="zoom_in" label="הגדלה" ariaLabel="הגדלת הצילום" onClick={onZoom} keepFocus />
      <BarButton icon="apps" label="כלים" ariaLabel="פקודות וכלים" onClick={onTools} />
      <span className="flex-1" />
      {claimState === 'available' ? (
        <Button variant="filled" icon="lock" onClick={onClaim} disabled={!onClaim} aria-label="תפוס עמוד" className="whitespace-nowrap">
          תפוס
        </Button>
      ) : claimState === 'mine' ? (
        <Button variant="filled" icon="check" onClick={onFinish} disabled={finishDisabled}>
          סיים
        </Button>
      ) : null}
    </nav>
  )
}

function BarButton({ icon, label, ariaLabel, onClick, keepFocus = false }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onMouseDown={keepFocus ? (event) => event.preventDefault() : undefined}
      onClick={onClick}
      className={cx(
        'flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-(--radius-control) px-2 text-label-sm font-normal text-(--tool-fg) hover:bg-(--tool-bg-hover)',
        FOCUS_RING
      )}
    >
      <AppIcon name={icon} className="text-2xl font-(--tool-icon-weight)" />
      <span aria-hidden="true">{label}</span>
    </button>
  )
}
