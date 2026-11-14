'use client'

import { SCRIPT_LABELS, WORD_SCRIPTS } from '@/lib/trainingProof/vocab'

// תמונת-שורה מעורבת עם מסגרת לכל מילה. שם-הכתב של המילה **מעל** המסגרת, לא בתוכה (ה-7).
// onCycle(k) — לחיצה על מסגרת מחליפה את הכתב שלה (מרובע ← רש"י ← לועזית ← ניטרלי ← …).
// בלי onCycle — לקריאה בלבד. onError — התמונה לא נטענה (השורה מציגה הודעה במקומה).

// אותם גוונים כמו תג-הכתב (bits/ScriptTag) — מהטוקנים, נכונים גם במצב כהה
const BOX = {
  square: 'border-on-info-container bg-info-container/30',
  rashi: 'border-on-warning-container bg-warning-container/30',
  latin: 'border-success bg-success-container/30',
  neutral: 'border-outline bg-surface-container-high/30',
}
const LABEL = {
  square: 'bg-info-container text-on-info-container',
  rashi: 'bg-warning-container text-on-warning-container',
  latin: 'bg-success-container text-on-success-container',
  neutral: 'bg-surface-container-highest text-on-surface-variant',
}

export const nextScript = (s) => WORD_SCRIPTS[(WORD_SCRIPTS.indexOf(s) + 1) % WORD_SCRIPTS.length]

export default function WordBoxes({ src, w, h, words, onCycle = null, onError }) {
  return (
    <div className="max-w-full self-start rounded-(--radius-control) bg-surface-container-low p-2 pt-7">
      <div className="relative inline-block max-w-full">
        <img src={src} alt="תמונת השורה" width={w} height={h} loading="lazy" onError={onError} className="block h-auto max-w-full rounded-(--radius-xs)" />
        {words.map((wd) => {
          const [x0, y0, x1, y1] = wd.box
          const style = { left: `${(x0 / w) * 100}%`, top: `${(y0 / h) * 100}%`, width: `${((x1 - x0) / w) * 100}%`, height: `${((y1 - y0) / h) * 100}%` }
          const label = SCRIPT_LABELS[wd.label] || '?'
          const inner = (
            <span className={`pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-(--radius-xs) px-1 text-label-sm ${LABEL[wd.label] || LABEL.neutral}`}>
              {label}
            </span>
          )
          return onCycle ? (
            <button
              key={wd.k}
              type="button"
              data-word={wd.k}
              aria-label={`מילה ${wd.k + 1}: ${label} — לחיצה מחליפה כתב`}
              onClick={() => onCycle(wd.k)}
              className={`absolute rounded-(--radius-xs) border-2 ${BOX[wd.label] || BOX.neutral} hover:ring-2 hover:ring-primary`}
              style={style}
            >
              {inner}
            </button>
          ) : (
            <span key={wd.k} data-word={wd.k} className={`absolute rounded-(--radius-xs) border-2 ${BOX[wd.label] || BOX.neutral}`} style={style}>
              {inner}
            </span>
          )
        })}
      </div>
    </div>
  )
}
