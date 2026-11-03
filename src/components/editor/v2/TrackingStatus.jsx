'use client'

import Tooltip from '@/components/ui/Tooltip'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { TOUCH_TARGET_OVERLAY } from '@/components/ui/buttonStyles'
import { trackingInfo } from './editorStatusText'

/** נקודת המצב: מלאה ברמת מילה, חצי בשורה, טבעת בסרגל, מקווקוות בכבוי — צורה ולא רק צבע */
const DOT = {
  word: 'bg-success border-success',
  line: 'border-primary bg-[linear-gradient(to_top,var(--color-primary)_50%,transparent_50%)]',
  ruler: 'border-primary bg-transparent',
  off: 'border-dashed border-outline bg-transparent'
}

/**
 * רמת המעקב הנוכחית ("מעקב מילה", "מעקב שורה · מיקום המילה משוער", "סרגל ידני", "מעקב כבוי"),
 * עם המקור (מזיהוי הטקסט / מעמוד ההגהה / מזיהוי בדפדפן / מניתוח התמונה / ידני) והסבר ברמז.
 * מעבר רמה מוכרז (aria-live) — זה שינוי שהמתנדב צריך לדעת עליו.
 * downgraded — הרמה הורדה כי הפריסה לא זוהתה בבטחה מהתמונה (תווית והסבר משלה).
 * onClick (אופציונלי) — הופך את התווית לכפתור (למשל לפתיחת כרטיס "רמות המעקב").
 *
 * @param {{ level: 'word'|'line'|'ruler'|'off', source?: 'layout'|'proof'|'local'|'profile'|'manual',
 *   estimated?: boolean, downgraded?: boolean, onClick?: () => void, clickLabel?: string, compact?: boolean, className?: string }} props
 * compact — בשורת המצב: התווית מוסתרת במסך צר, והכפתור בגובה השורה (מטרת מגע 44px דרך ::before).
 */
export default function TrackingStatus({ level, source, estimated = false, downgraded = false, onClick, clickLabel = 'רמות המעקב', compact = false, className }) {
  const info = trackingInfo({ level, source, estimated, downgraded })
  const body = (
    <>
      <span aria-hidden="true" className={cx('size-2.5 shrink-0 rounded-(--radius-pill) border-2', DOT[info.level])} />
      <span className={cx('truncate font-medium text-on-surface', compact && 'max-sm:sr-only')}>{info.label}</span>
      {info.sourceLabel && <span className="sr-only">{` (${info.sourceLabel})`}</span>}
    </>
  )
  const tip = (
    <span className="block max-w-64">
      {info.sourceLabel && <span className="block font-semibold">{`מקור: ${info.sourceLabel}`}</span>}
      <span className="block">{info.hint}</span>
    </span>
  )

  return (
    <span className={cx('inline-flex min-w-0 items-center', className)} data-level={info.level}>
      <span className="sr-only" aria-live="polite">{info.full}</span>
      {onClick ? (
        <Tooltip content={tip} compact={compact} className="min-w-0">
          <button
            type="button"
            onClick={onClick}
            aria-label={`${info.full}. ${clickLabel}`}
            className={cx('inline-flex min-w-0 items-center gap-2 rounded-(--radius-control) px-1.5 hover:bg-surface-selected', compact ? cx('min-h-(--editor-statusbar-height)', TOUCH_TARGET_OVERLAY) : 'min-h-(--touch-target)', FOCUS_RING)}
          >
            {body}
          </button>
        </Tooltip>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-2" title={info.hint} aria-hidden="true">{body}</span>
      )}
    </span>
  )
}
