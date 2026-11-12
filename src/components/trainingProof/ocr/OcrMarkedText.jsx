'use client'

import { useState } from 'react'
import Chip from '@/components/ui/Chip'
import { LEVEL_HE, markedSegments } from '@/lib/trainingProof/wordMarks'
import { MARK_CLASS, MARK_STYLE, TEXT_CLASS, TEXT_STYLE } from './OcrTextEditor'

// הטקסט של השורה עם המילים החשודות ("המגיה"). לחיצה על מילה פותחת מתחת לטקסט את החלופות שלה;
// לחיצה על חלופה ← onPick(i, alt): העורך נפתח עם החלופה במקום המילה, והמתנדב מאשר כרגיל (Enter).
// בלי סימונים — בדיוק הפסקה של קודם.
export default function OcrMarkedText({ text, marks, ltr, disabled, onPick, onDoubleClick }) {
  const [open, setOpen] = useState(null)
  const segs = markedSegments(text, marks)
  const cur = open == null ? null : marks.find((m) => m.i === open) || null

  return (
    <>
      <p dir={ltr ? 'ltr' : 'rtl'} className={`min-h-[1.5em] cursor-text ${TEXT_CLASS} ${ltr ? 'text-left' : ''}`} style={TEXT_STYLE} onDoubleClick={onDoubleClick}>
        {segs.map((s, k) =>
          s.mark ? (
            <button
              key={k}
              type="button"
              data-tp-mark={s.mark.level}
              aria-expanded={open === s.mark.i}
              title={`${LEVEL_HE[s.mark.level]} — לחצו לפרטים`}
              className={`cursor-pointer ${MARK_CLASS[s.mark.level]} ${open === s.mark.i ? 'outline-2 outline-offset-1 outline-primary' : ''}`}
              style={{ font: 'inherit', ...MARK_STYLE[s.mark.level] }}
              onClick={() => setOpen(open === s.mark.i ? null : s.mark.i)}
            >
              {s.text}
            </button>
          ) : (
            <span key={k}>{s.text}</span>
          )
        )}
      </p>
      {cur ? (
        <div data-tp-mark-panel="" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-2.5 text-body-sm text-on-surface-variant">
          <span>
            {LEVEL_HE[cur.level]}: <b className="text-on-surface">{cur.word}</b>
            {cur.level === 'fix' ? ' — אולי:' : ' — השוו למילה בתמונה'}
          </span>
          {cur.level === 'fix'
            ? cur.sugg.map((alt) => (
                <Chip
                  key={alt}
                  disabled={disabled}
                  title="מכניס את החלופה לשדה-העריכה; Enter שומר"
                  onClick={() => {
                    setOpen(null)
                    onPick(cur.i, alt)
                  }}
                >
                  {alt}
                </Chip>
              ))
            : null}
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setOpen(null)}>
            סגור
          </button>
        </div>
      ) : null}
    </>
  )
}
