'use client'

import { useRef } from 'react'
import { cx } from './cx'
import { FOCUS_RING } from './focusRing'

/**
 * בחירה אחת מתוך מעט אפשרויות (2–4), כשורת כפתורים מחוברים. סמנטיקה של radiogroup:
 * Tab נכנס לאפשרות הנבחרת בלבד, וחצים (ימין/שמאל, לפי RTL; גם למעלה/למטה) עוברים
 * ובוחרים מיד — כמו כפתורי רדיו. המצב הנבחר: רקע טונלי + מסגרת primary (לא צבע בלבד).
 *
 * @param {{ options: { value: string, label: import('react').ReactNode }[], value: string,
 *   onChange: (value: string) => void, label?: string, labelledBy?: string, fullWidth?: boolean, className?: string }} props
 * fullWidth — ברוחב המכל, האפשרויות ברוחב שווה (למשל כרטיסי ערכה עם דוגמת צבע).
 */
export default function SegmentedControl({ options, value, onChange, label, labelledBy, fullWidth = false, className }) {
  const refs = useRef([])
  const current = Math.max(0, options.findIndex((o) => o.value === value))

  const move = (delta) => {
    const next = (current + delta + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  const onKeyDown = (event) => {
    // ב-RTL "קדימה" הוא שמאלה
    const rtl = event.currentTarget.closest('[dir]')?.getAttribute('dir') !== 'ltr'
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const backward = rtl ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === forward || event.key === 'ArrowDown') { event.preventDefault(); move(1) }
    else if (event.key === backward || event.key === 'ArrowUp') { event.preventDefault(); move(-1) }
  }

  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className={cx(fullWidth ? 'flex w-full' : 'inline-flex', 'rounded-(--radius-control) border border-outline', className)}
    >
      {options.map((option, index) => {
        const selected = index === current
        return (
          <button
            key={option.value}
            ref={(el) => { refs.current[index] = el }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cx(
              'min-h-(--touch-target) px-4 text-label-md transition-colors motion-reduce:transition-none',
              fullWidth && 'flex-1 py-2',
              'first:rounded-s-(--radius-control) last:rounded-e-(--radius-control)',
              index > 0 && 'border-s border-outline',
              selected
                ? 'bg-secondary-container text-on-secondary-container outline-2 -outline-offset-2 outline-primary'
                : 'text-on-surface-variant hover:bg-surface-selected',
              FOCUS_RING
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
