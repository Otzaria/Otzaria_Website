'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Chip from '@/components/ui/Chip'
import { marksForText, replaceWord } from '@/lib/trainingProof/wordMarks'
import { wordSpans, wordIndexAt } from './caretWord'

export const TEXT_CLASS = 'rounded-lg px-2 py-1 text-[25px] leading-snug text-on-surface'
export const TEXT_STYLE = { fontFamily: 'var(--font-frank), var(--font-hebrew), serif', unicodeBidi: 'plaintext' }
// מילה חשודה ("המגיה") — מצבעי האתר בלבד: "הצעת תיקון" — רקע (כמו המילה שתחת הסמן), "בדוק מילה זו" —
// קו מנוקד, כמו המילים החשודות בעורך הספרים (TextMirror)
export const MARK_CLASS = { fix: 'rounded-sm bg-warning-200', check: '' }
export const MARK_STYLE = {
  fix: undefined,
  check: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: 'var(--color-on-warning-container)',
    textDecorationThickness: '2px',
    textUnderlineOffset: '0.32em',
  },
}

// העמדה של הסמן (הקצה שזז בבחירה), לא תחילת הבחירה
const caretOf = (ta) => (ta.selectionDirection === 'backward' ? ta.selectionStart : ta.selectionEnd)

// עריכת טקסט-השורה במקום ("תקן"): נפתח עם הטקסט הנוכחי והסמן בתחילתו (בעברית — בימין).
// Enter (או יציאה מהשדה) שומר, Esc מבטל. השורה כולה — בלי מילה-מילה (ה-6).
// המילה שתחת הסמן מסומנת ברקע: עותק-מראה של הטקסט מאחורי השדה (שקוף), באותו גופן ובאותם
// מרווחים, והמילה בו צבועה. onCaret({ text, k }) — כדי שהכרטיס יסמן אותה גם על התמונה.
// marks — המילים החשודות ("המגיה"): מסומנות גם כאן (כל עוד לא שונו), ומתחת לשדה — החלופות של
// "הצעת תיקון"; לחיצה על חלופה מחליפה את המילה בשדה בלבד (השמירה — Enter, כרגיל). caret — מיקום-התחלה.
export default function OcrTextEditor({ initial, caret: caret0 = 0, ltr, marks, onCommit, onCancel, onCaret }) {
  const [value, setValue] = useState(initial)
  const [caret, setCaret] = useState(caret0)
  const ref = useRef(null)
  const done = useRef(false)

  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(caret0, caret0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- רק בפתיחה
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
  const live = useMemo(() => marksForText(marks, value), [marks, value])
  const markAt = new Map(live.map((m) => [m.i, m]))
  const fixes = live.filter((m) => m.level === 'fix')
  const pick = (m, alt) => {
    const r = replaceWord(value, m.i, alt)
    const ta = ref.current
    if (!r || !ta) return
    setValue(r.text)
    setCaret(r.caret)
    requestAnimationFrame(() => ta.setSelectionRange(r.caret, r.caret))
  }
  // המראה: כל מילה במקטע משלה — המילה שתחת הסמן ברקע, מילה חשודה כמו בתצוגה (OcrMarkedText)
  const mirror = []
  let from = 0
  spans.forEach((sp, j) => {
    if (sp.s > from) mirror.push(value.slice(from, sp.s))
    const m = markAt.get(j)
    const t = value.slice(sp.s, sp.e)
    if (j === k) {
      mirror.push(
        <mark key={j} data-tp-word-text="" className="rounded-sm bg-warning-200" style={{ color: 'transparent' }}>
          {t}
        </mark>
      )
    } else if (m) {
      mirror.push(
        <span key={j} data-tp-mark={m.level} className={m.level === 'fix' ? 'rounded-sm bg-warning-200/60' : ''} style={MARK_STYLE[m.level]}>
          {t}
        </span>
      )
    } else mirror.push(t)
    from = sp.e
  })
  if (from < value.length) mirror.push(value.slice(from))
  return (
    <>
      <div className="relative rounded-lg bg-surface-container-low outline-2 outline-primary">
        {/* המראה: קובע את הגובה (השדה נמתח עליו), והטקסט בו שקוף — רואים רק את רקע המילה */}
        <div aria-hidden="true" dir={ltr ? 'ltr' : 'rtl'} className={`${TEXT_CLASS} break-words whitespace-pre-wrap ${ltr ? 'text-left' : ''}`} style={{ ...TEXT_STYLE, color: 'transparent' }}>
          {word || live.length ? mirror : value}
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
      {fixes.length ? (
        <div data-tp-mark-panel="" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2.5 text-body-sm text-on-surface-variant">
          {fixes.map((m) => (
            <span key={m.i} className="inline-flex flex-wrap items-center gap-1.5">
              <span>
                <b className="text-on-surface">{m.word}</b> ←
              </span>
              {m.sugg.map((alt) => (
                <Chip
                  key={alt}
                  title="מחליף את המילה בשדה; Enter שומר"
                  // בלי לצאת מהשדה — יציאה ממנו שומרת
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(m, alt)}
                >
                  {alt}
                </Chip>
              ))}
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
