'use client'

import { useState } from 'react'
import FloatingPanel from '@/components/ui/FloatingPanel'
import Button from '@/components/ui/Button'
import { queryEditorField } from '@/lib/editor/editorField'
import { applyFieldEdit } from '@/lib/editor/applyFieldEdit'
import { replaceReviewedWord } from '@/lib/editor/ocrWordReview'
import { formatPct } from '@/lib/pageProof/wordPopup'
import { revealCaret } from '@/hooks/useWordTracking'

const REASONS = {
  low_conf: 'ביטחון זיהוי נמוך', alternatives: 'חלופות זיהוי', language_model: 'הצעת מודל השפה',
  mixed_script: 'כתבים מעורבים', digit_in_word: 'ספרה בתוך מילה', final_mid: 'אות סופית באמצע מילה',
  non_final_end: 'אות רגילה בסוף מילה', repeated_char: 'אות חוזרת', inner_punct: 'פיסוק בתוך מילה'
}
const SOURCES = { recognition: 'זיהוי', language: 'מודל השפה', context: 'מתאימה להקשר' }
const idOf = (s) => `${s.column}:${s.start}:${s.text}`
const defaultPosition = (vp) => ({ x: Math.max(16, vp.width - 440 - 24), y: 96 })

/** Non-modal: volunteers can inspect the scan and type while reviewing. The same
 * live review result supplies highlights, this list, the status count and finish. */
export default function OcrWordReviewPanel({ review, textContainerRef, onApplyText, onSetAccepted, onClose }) {
  const [selected, setSelected] = useState(null)
  const [stale, setStale] = useState(false)
  const suspects = review?.suspects || []
  const index = Math.max(0, suspects.findIndex((s) => idOf(s) === selected))
  const current = suspects[index]
  const fieldFor = (s) => queryEditorField(textContainerRef.current, s?.column || 'content')
  const select = (s) => {
    setSelected(idOf(s))
    const field = fieldFor(s)
    if (!field || field.value !== review.fields[s.column].text) { setStale(true); return }
    setStale(false)
    field.focus()
    field.setSelectionRange(s.start, s.end)
    field.dispatchEvent(new Event('select', { bubbles: true }))
    revealCaret(field, s.start)
  }
  const replace = (suggestion) => {
    if (!current) return
    const field = fieldFor(current)
    // A fetch/render or a manual keystroke may have changed the word while this
    // button was visible. Never apply an old suggestion to a new offset.
    const next = field && field.value === review.fields[current.column].text
      ? replaceReviewedWord(field.value, current, suggestion.text) : null
    if (!next) { setStale(true); return }
    setStale(false)
    applyFieldEdit(field, () => next, (value) => onApplyText(current.column, value))
  }
  const setAccepted = (word, accept) => {
    const field = fieldFor(word)
    if (!field || field.value !== review.fields[word.column].text || onSetAccepted?.(word, accept) === false) {
      setStale(true)
      return
    }
    setStale(false)
    if (accept && suspects.length > 1) select(suspects[(index + 1) % suspects.length])
    else if (!accept) setSelected(idOf(word))
  }

  return (
    <FloatingPanel title="מילים חשודות" icon="spellcheck" width={440} defaultPosition={defaultPosition}
      storageKey="ocrWordReviewPosition" onClose={onClose}
      escapeWithin=".editor-container"
      returnFocus={() => queryEditorField(textContainerRef.current)}>
      <p className="mb-3 text-body-sm text-on-surface-variant">בדקו מול הצילום, ובחרו החלפה או סמנו שהמילה תקינה. הסימון חל על המופע הזה בלבד ונשמר בעמוד.</p>
      {review?.status === 'loading' && <p role="status">נתוני החשד מהזיהוי נטענים…</p>}
      {review?.status === 'unavailable' && <p role="status">אין נתוני חשד מהזיהוי לעמוד. מוצגות בדיקות בסיסיות של צורת המילים בלבד.</p>}
      {stale && <p role="status">הטקסט השתנה. בחרו שוב מילה מהרשימה המעודכנת.</p>}
      {suspects.length ? <>
        <div className="my-3 flex items-center gap-2">
          <Button variant="text" onClick={() => select(suspects[(index - 1 + suspects.length) % suspects.length])}>הקודמת</Button>
          <span className="flex-1 text-center text-body-sm" aria-live="polite">{index + 1} מתוך {suspects.length}</span>
          <Button variant="text" onClick={() => select(suspects[(index + 1) % suspects.length])}>הבאה</Button>
        </div>
        <ul aria-label="מילים לבדיקה" className="mb-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {suspects.map((s, i) => <li key={idOf(s)}>
            <button type="button" aria-pressed={s === current} onClick={() => select(s)}
              aria-label={`${s.text} — ${s.column === 'left' ? 'טור שמאל' : s.column === 'right' ? 'טור ימין' : 'טקסט'}, מילה ${i + 1} ברשימה`}
              className="rounded border border-outline-variant px-2 py-1 text-body-md text-primary hover:bg-surface-selected aria-pressed:border-primary aria-pressed:bg-surface-selected focus-visible:outline-2">
              {s.text}
            </button>
          </li>)}
        </ul>
        <section aria-label={`הצעות למילה ${current.text}`} className="border-t border-outline-variant pt-3">
          <p className="text-title-md">{current.text}</p>
          {onSetAccepted && <Button variant="tonal" icon="check" onClick={() => setAccepted(current, true)}>המילה תקינה</Button>}
          <p className="mb-2 text-body-sm text-on-surface-variant">{current.reasons.map((r) => REASONS[r] || r).join(' · ')}</p>
          {current.p !== null && current.p !== undefined && <p className="text-body-sm">סבירות המילה המקורית לפי הזיהוי: {formatPct(current.p)}</p>}
          {current.suggestions.length ? <ul aria-label="הצעות להחלפה" className="mt-2 space-y-2">
            {current.suggestions.map((s) => <li key={s.text} className="flex items-center justify-between gap-3">
              <span>{s.text}<small className="ms-2 text-on-surface-variant">{s.sources.map((k) => SOURCES[k]).join(' · ')}{s.p !== null ? ` · ${formatPct(s.p)}` : ''}</small></span>
              <Button variant="tonal" onClick={() => replace(s)} aria-label={`החלף ב${s.text}`}>החלף</Button>
            </li>)}
          </ul> : <p className="text-body-sm">אין הצעות חלופיות. אפשר לתקן ישירות בעורך לפי הצילום.</p>}
        </section>
      </> : review?.status !== 'loading' && <p className="mt-3">אין כרגע מילים מסומנות לבדיקה.</p>}
      {onSetAccepted && review?.accepted?.length > 0 && <details className="mt-4 border-t border-outline-variant pt-3">
        <summary className="cursor-pointer text-body-sm">מילים שסומנו כתקינות ({review.accepted.length})</summary>
        <ul aria-label="מילים שסומנו כתקינות" className="mt-2 max-h-40 space-y-2 overflow-y-auto">
          {review.accepted.map((s, i) => <li key={idOf(s)} className="flex items-center justify-between gap-2">
            <button type="button" className="text-primary" onClick={() => select(s)}>{s.text}</button>
            <Button variant="text" onClick={() => setAccepted(s, false)} aria-label={`החזר לבדיקה: ${s.text}, מופע ${i + 1}`}>החזר לבדיקה</Button>
          </li>)}
        </ul>
      </details>}
    </FloatingPanel>
  )
}
