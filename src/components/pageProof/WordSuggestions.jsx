'use client'

import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { SUGGESTION_GROUPS, formatPct, placePopup } from '@/lib/pageProof/wordPopup'

// חלונית-ההצעות למילה — חלונית צפה (portal ל-document.body) מתחת למילה.
// מציגה את חלופות-הזיהוי עם הסבירות (כחול), הצעות מודל-השפה (סגול) וחלופת-
// זיהוי שמתאימה יותר להקשר (כתום). בחירה = תיקון-טקסט רגיל; אין החלפה
// אוטומטית לעולם. מי פותח ומי סוגר — useWordPopup (מכונת-המצבים ב-popupState).
//
// props:
//   data — הפלט של suggestionData: {word, p, otherP, items:[{text, kind, p, also}]}
//   anchorRect — {left, top, right, bottom} של המילה (getBoundingClientRect)
//   keyboard — נפתחה מהמקלדת: ↑↓ מסמנים, Enter בוחר (המקשים עצמם — ב-useWordPopup)
//   activeIndex — ההצעה המסומנת (-1 = אין)
//   disabledReason — טקסט כשאי אפשר להחליף (תצוגה בלבד / שורה שממתינה לזיהוי מחדש)
//   onPick(index), onMouseEnter, onMouseLeave, onActiveChange(index)

// סימון החלונית ב-DOM — useWordPopup מתעלם מגלילה שבתוכה
export const WORD_POPUP_SELECTOR = '[data-proof-word-popup]'

const KIND_CLS = {
  rec: { text: 'text-warning-strong-700', head: 'text-warning-strong-800', dot: 'bg-warning-strong-500' },
  alt: { text: 'text-info-700', head: 'text-info-800', dot: 'bg-info-500' },
  lm: { text: 'text-feature-700', head: 'text-feature-800', dot: 'bg-feature-500' },
}
const GROUP_HE = Object.fromEntries(SUGGESTION_GROUPS.map((g) => [g.kind, g.he]))

function SuggestionOption({ item, index, id, active, disabled, onPick, onActiveChange }) {
  const cls = KIND_CLS[item.kind] || KIND_CLS.alt
  return (
    <button
      type="button"
      role="option"
      id={id}
      tabIndex={-1}
      aria-selected={active}
      aria-disabled={disabled || undefined}
      data-kind={item.kind}
      onMouseEnter={() => onActiveChange?.(index)}
      onClick={() => {
        if (!disabled) onPick?.(index)
      }}
      className={`flex w-full items-center justify-between gap-3 rounded px-2 py-1 text-right transition-colors ${
        active ? 'bg-primary-container ring-1 ring-primary/40' : 'hover:bg-neutral-100'
      } ${disabled ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
    >
      <span className={`font-bold ${cls.text}`}>{item.text}</span>
      <span className="flex shrink-0 items-center gap-1 text-xs text-on-surface/60">
        {item.also.map((k) => (
          <span key={k} className={`inline-block h-1.5 w-1.5 rounded-full ${KIND_CLS[k]?.dot || ''}`} title={`גם: ${GROUP_HE[k] || k}`} />
        ))}
        {item.p != null && <span className="tabular-nums">{formatPct(item.p)}</span>}
      </span>
    </button>
  )
}

export default function WordSuggestions({
  id = 'proof-word-popup',
  data,
  anchorRect = null,
  keyboard = false,
  activeIndex = -1,
  disabledReason = null,
  onPick,
  onMouseEnter,
  onMouseLeave,
  onActiveChange,
}) {
  const boxRef = useRef(null)

  // מיקום לפני הציור (useLayoutEffect) — כתיבה ישירה ל-style, בלי רינדור נוסף.
  // רץ אחרי כל רינדור: התוכן (וגובה החלונית) יכול להשתנות.
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const { top, left, above } = placePopup(
      anchorRect || { left: 0, top: 0, right: 0, bottom: 0 },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight }
    )
    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.dataset.above = above ? 'true' : 'false'
  })

  if (!data || typeof document === 'undefined') return null
  const disabled = !!disabledReason
  const groups = SUGGESTION_GROUPS.map((g) => ({ ...g, items: data.items.map((item, index) => ({ item, index })).filter((x) => x.item.kind === g.kind) })).filter(
    (g) => g.items.length
  )
  const optId = (k) => `${id}-opt-${k}`

  return createPortal(
    <div
      ref={boxRef}
      id={id}
      data-proof-word-popup=""
      role="listbox"
      aria-label={`הצעות למילה ${data.word}`}
      aria-activedescendant={activeIndex >= 0 && activeIndex < data.items.length ? optId(activeIndex) : undefined}
      dir="rtl"
      style={{ position: 'fixed' }}
      className="z-[60] w-64 max-h-80 overflow-y-auto rounded-lg border border-surface-variant bg-white p-2 text-sm text-on-surface shadow-xl"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      // הסמן והבחירה נשארים בעורך: לחיצה בחלונית אינה לוקחת פוקוס
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center justify-between gap-2 border-b border-surface-variant pb-1 text-xs">
        <span className="font-bold text-on-surface">«{data.word}»</span>
        <span className="text-on-surface/60">{data.p != null ? `נכונה בסבירות ${formatPct(data.p)}` : 'המחשב חושד במילה הזו'}</span>
      </div>

      {groups.map((g) => (
        <div key={g.kind} role="group" aria-label={g.he} className="mb-1">
          <div className={`px-2 pt-0.5 text-[11px] font-bold ${KIND_CLS[g.kind].head}`} title={g.hint} aria-hidden="true">
            {g.he}
          </div>
          {g.items.map(({ item, index }) => (
            <SuggestionOption
              key={`${g.kind}-${item.text}`}
              item={item}
              index={index}
              id={optId(index)}
              active={index === activeIndex}
              disabled={disabled}
              onPick={onPick}
              onActiveChange={onActiveChange}
            />
          ))}
        </div>
      ))}

      {data.otherP != null && <div className="px-2 text-[11px] text-on-surface/50">אף אחת מההצעות: {formatPct(data.otherP)}</div>}
      <div className="mt-1 border-t border-surface-variant pt-1 text-[11px] text-on-surface/55">
        {disabledReason || (keyboard ? '↑ ↓ בחירה · Enter החלפה · Esc סגירה' : 'לחיצה על הצעה מחליפה את המילה · Esc סגירה')}
      </div>
    </div>,
    document.body
  )
}
