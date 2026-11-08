import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import AppIcon from './AppIcon'
import { TOUCH_TARGET_OVERLAY } from './buttonStyles'
import { cx } from './cx'
import { FOCUS_RING } from './focusRing'

/**
 * שבב — תגית לחיצה (Material 3: filter chip / assist chip), בניגוד ל-ui/Badge שאינו לחיץ.
 *
 * href → קישור (Next Link בלי prefetch) — למשל קטגוריה. current → aria-current="page".
 * אחרת <button>: selected → aria-pressed (מסנן דו-מצבי: "כל התגיות", תגית).
 * נבחר — רקע טונלי + מסגרת primary (--chip-selected-border, ניגודיות 3:1 לפחות מול הרקע ומול שבב רגיל
 * בבהיר ובכהה); המסגרת היא שמבדילה את המצב, לא רק הרקע (WCAG 1.4.11).
 * icon — גליף לפני הטקסט; count — מספר שקט אחרי הטקסט ("(12)" — בלי סוגריים; הם בעיצוב).
 *
 * מידות: גובה חזותי --chip-height (36px), ומטרת מגע של 44px דרך ::before (כמו כפתור header),
 * לכן ברשימת שבבים — רווח אנכי של לפחות gap-y-2.5 כדי שמטרות המגע לא יחפפו.
 * Server Component (בלי hooks) — onClick מועבר רק מרכיב לקוח.
 */
const BASE = cx(
  'inline-flex min-h-(--chip-height) max-w-full shrink-0 items-center gap-1.5 rounded-(--chip-radius) border px-3.5 text-label-md transition-colors',
  TOUCH_TARGET_OVERLAY,
  FOCUS_RING
)
const IDLE =
  'border-(--chip-border) bg-(--chip-bg) text-(--chip-fg) hover:border-(--chip-border-hover) hover:bg-(--chip-bg-hover) hover:text-(--chip-fg-hover)'
const SELECTED =
  'border-(--chip-selected-border) bg-(--chip-selected-bg) text-(--chip-selected-fg) hover:bg-(--chip-selected-bg-hover)'

export function chipClasses({ selected = false, className }: { selected?: boolean; className?: string } = {}) {
  return cx(BASE, selected ? SELECTED : IDLE, className)
}

type CommonProps = {
  children: ReactNode
  icon?: string
  count?: number
  className?: string
}

type LinkChip = CommonProps & {
  href: string
  current?: boolean
  prefetch?: boolean
}

type ButtonChip = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    href?: undefined
    selected?: boolean
  }

export type ChipProps = LinkChip | ButtonChip

function content({ icon, count, children }: CommonProps) {
  return (
    <>
      {icon && <AppIcon name={icon} className="text-(length:--chip-icon-size)" />}
      <span className="truncate">{children}</span>
      {typeof count === 'number' && (
        <>
          {/* הרווח החזותי בא מ-gap, אבל שם נגיש מחבר טקסט של פריטי flex בלי רווח ("כלי לימוד(20)") —
              רווח אמיתי לקורא המסך */}
          <span className="sr-only"> </span>
          <span className="text-label-sm font-normal opacity-80 tabular-nums">({count.toLocaleString('he-IL')})</span>
        </>
      )}
    </>
  )
}

export default function Chip(props: ChipProps) {
  if (props.href !== undefined) {
    const { href, current = false, prefetch = false, icon, count, className, children } = props
    return (
      <Link
        href={href}
        prefetch={prefetch}
        aria-current={current ? 'page' : undefined}
        data-selected={current ? '' : undefined}
        className={chipClasses({ selected: current, className })}
      >
        {content({ icon, count, children })}
      </Link>
    )
  }
  const { selected, icon, count, className, children, type = 'button', ...rest } = props
  return (
    <button
      {...rest}
      type={type}
      aria-pressed={selected === undefined ? undefined : selected}
      data-selected={selected ? '' : undefined}
      className={chipClasses({ selected: Boolean(selected), className })}
    >
      {content({ icon, count, children })}
    </button>
  )
}
