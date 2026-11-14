'use client'

import { useEffect, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { saveStatusInfo } from './editorStatusText'

const TONE_ICON = {
  success: 'text-success',
  error: 'text-error',
  neutral: 'text-on-surface-variant'
}

/** שעון שמתקדם כל intervalMs — לטקסט יחסי ("לפני 5 דק׳") */
function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * מצב השמירה (נשמר / שומר / שינויים שלא נשמרו / נכשל). אזור חי מנומס, כך שקורא מסך שומע
 * מעבר מצב — אבל לא כל דקה: הטקסט היחסי מתעדכן רק בתצוגה (aria-live על המצב בלבד).
 * במצב error, ואם יש onRetry — כפתור "נסה שוב".
 *
 * @param {{ status: 'saved'|'saving'|'dirty'|'error', lastSavedAt?: Date|number|string|null,
 *   onRetry?: () => void, compact?: boolean, className?: string, textClassName?: string }} props
 */
export default function SaveStatusIndicator({ status, lastSavedAt = null, onRetry, compact = false, className, textClassName }) {
  const now = useNow(30_000)
  const info = saveStatusInfo(status, lastSavedAt, now)
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5 text-body-sm text-on-surface-variant', className)}>
      <AppIcon
        name={info.icon}
        className={cx('text-xl font-(--tool-icon-weight)', TONE_ICON[info.tone], status === 'saving' && 'animate-pulse motion-reduce:animate-none')}
      />
      <span role="status" aria-live="polite" className={cx('truncate', compact && 'sr-only', status === 'error' && 'text-error', textClassName)}>
        {info.text}
      </span>
      {status === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cx('min-h-(--touch-target) rounded-(--radius-control) px-2 text-label-md font-normal text-primary hover:bg-surface-selected', FOCUS_RING)}
        >
          נסה שוב
        </button>
      )}
    </span>
  )
}
