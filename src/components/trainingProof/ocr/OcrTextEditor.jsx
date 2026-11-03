'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { wordSpans, wordIndexAt } from './caretWord'

export const TEXT_CLASS = 'rounded-lg px-2 py-1 text-[25px] leading-snug text-on-surface'
export const TEXT_STYLE = { fontFamily: 'var(--font-frank), var(--font-hebrew), serif', unicodeBidi: 'plaintext' }

// העמדה של הסמן (הקצה שזז בבחירה), לא תחילת הבחירה
const caretOf = (ta) => (ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd)

// עריכת טקסט-השורה במקום ("תקן"): נפתח עם הטקסט הנוכחי והסמן בתחילתו (בעברית — בימין).
// Enter (או יציאה מהשדה) שומר, Esc מבטל. השורה כולה — בלי מילה-מילה (ה-6).
// המילה שתחת הסמן מסומנת ברקע: עותק-מראה של הטקסט מאחורי השדה (שקוף), באותו גופן ובאותם
// מרווחים, והמילה בו צבועה. onCaret({ text, k }) — כדי שהכרטיס יסמן אותה גם על התמונה.
export default function OcrTextEditor({ initial, ltr, onCommit, onCancel, onCaret }) {
  const [value, setValue] = useState(initial)
  const [caret, setCaret] = useState(0)
  const ref = useRef(null)
  const done = useRef(false)

  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(0, 0)
  }, [])

  const spans = useMemo(() => wordSpans(value), [value])
  const k = wordIndexAt(spans, caret)
  useEffect(() => {
    onCaret?.({ text: value, k })
  }, [value, k, onCaret])

  const finish = (save) => {
    if (done.current) return
    done.current = true
    if (save) onCommit(value.trim())
    else onCancel()
  }

  const word = spans[k]
  return (
    <div className="relative rounded-lg bg-surface-container-low outline-2 outline-primary">
      {/* המראה: קובע את הגובה (השדה נמתח עליו), והטקסט בו שקוף — רואים רק את רקע המילה */}
      <div aria-hidden="true" dir={ltr ? 'ltr' : 'rtl'} className={`${TEXT_CLASS} break-words whitespace-pre-wrap ${ltr ? 'text-left' : ''}`} style={{ ...TEXT_STYLE, color: 'transparent' }}>
        {word ? (
          <>
            {value.slice(0, word.s)}
            <mark data-tp-word-text="" className="rounded-sm bg-warning-200" style={{ color: 'transparent' }}>
              {value.slice(word.s, word.e)}
            </mark>
            {value.slice(word.e)}
          </>
        ) : (
          value
        )}
        {'​'}
      </div>
      <textarea
        ref={ref}
        aria-label="הטקסט המתוקן"
        value={value}
        dir={ltr ? 'ltr' : 'rtl'}
        rows={1}
        onChange={(e) => {
          setValue(e.target.value.replace(/\n/g, ' '))
          setCaret(caretOf(e.target))
        }}
        onSelect={(e) => setCaret(caretOf(e.currentTarget))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            finish(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            finish(false)
          }
        }}
        onBlur={() => finish(true)}
        className={`absolute inset-0 block h-full w-full resize-none overflow-hidden bg-transparent outline-none ${TEXT_CLASS} ${ltr ? 'text-left' : ''}`}
        style={TEXT_STYLE}
      />
    </div>
  )
}
