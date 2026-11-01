'use client'

import { useId, useRef } from 'react'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { CONFUSABLE_SAMPLE, EDITOR_FONT_OPTIONS, editorFontFamily, NIQQUD_SAMPLE } from './editorShellLogic'

const GROUPS = [
  { serif: true, title: 'עם תגים' },
  { serif: false, title: 'בלי תגים — נוח למסך' }
]

/**
 * בחירת גופן ההקלדה: שתי קבוצות (עם תגים / בלי תגים), ובכל אפשרות שורת דוגמה בגופן עצמו —
 * האותיות הדומות ומילה מנוקדת עם טעם. radiogroup אחד (Tab נכנס לנבחר, חצים עוברים ובוחרים מיד),
 * כמו SegmentedControl — אבל אנכי ועם תצוגה מקדימה, כי ארבע אפשרויות עם דוגמה לא נכנסות בשורה.
 *
 * @param {{ value: string, onChange: (fontFamily: string) => void, labelledBy?: string }} props
 */
export default function FontPicker({ value, onChange, labelledBy }) {
  const refs = useRef({})
  const groupId = useId()
  const ordered = GROUPS.flatMap((g) => EDITOR_FONT_OPTIONS.filter((o) => o.serif === g.serif))
  const current = Math.max(0, ordered.findIndex((o) => o.value === value))

  const move = (delta) => {
    const next = ordered[(current + delta + ordered.length) % ordered.length]
    onChange(next.value)
    refs.current[next.value]?.focus()
  }

  const onKeyDown = (event) => {
    const rtl = event.currentTarget.closest('[dir]')?.getAttribute('dir') !== 'ltr'
    const forward = ['ArrowDown', rtl ? 'ArrowLeft' : 'ArrowRight']
    const backward = ['ArrowUp', rtl ? 'ArrowRight' : 'ArrowLeft']
    if (forward.includes(event.key)) { event.preventDefault(); move(1) }
    else if (backward.includes(event.key)) { event.preventDefault(); move(-1) }
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown} className="space-y-3">
      {GROUPS.map((group, gi) => (
        <div key={group.title} role="group" aria-labelledby={`${groupId}-${gi}`} className="space-y-1.5">
          <span id={`${groupId}-${gi}`} className="block text-label-md text-on-surface-variant">{group.title}</span>
          {EDITOR_FONT_OPTIONS.filter((o) => o.serif === group.serif).map((font) => (
            <FontOption
              key={font.value}
              font={font}
              selected={ordered[current].value === font.value}
              buttonRef={(el) => { refs.current[font.value] = el }}
              onSelect={() => onChange(font.value)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function FontOption({ font, selected, buttonRef, onSelect }) {
  const hintId = useId()
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={font.label}
      aria-describedby={hintId}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cx(
        'flex min-h-(--touch-target) w-full flex-col items-stretch gap-1 rounded-(--radius-control) border px-3 py-2 text-start transition-colors motion-reduce:transition-none',
        selected
          ? 'border-primary bg-secondary-container text-on-secondary-container outline-2 -outline-offset-2 outline-primary'
          : 'border-outline-variant text-on-surface hover:bg-surface-selected',
        FOCUS_RING
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-label-lg">{font.label}</span>
        <span id={hintId} className="text-body-sm text-on-surface-variant">{font.hint}</span>
      </span>
      {/* הדוגמה בגופן עצמו — לעין בלבד; השם והתיאור הם מה שנקרא */}
      <span aria-hidden="true" data-font-preview="" className="flex flex-wrap items-baseline justify-between gap-3 text-[1.125rem] leading-normal" style={{ fontFamily: editorFontFamily(font.value) }}>
        <span>{CONFUSABLE_SAMPLE}</span>
        <span>{NIQQUD_SAMPLE}</span>
      </span>
    </button>
  )
}
