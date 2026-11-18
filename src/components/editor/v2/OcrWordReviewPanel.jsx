'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FloatingPanel from '@/components/ui/FloatingPanel'
import Button from '@/components/ui/Button'
import { queryEditorField } from '@/lib/editor/editorField'
import { suspectId as idOf } from '@/lib/editor/suspectPopup'
import { revealCaret } from '@/hooks/useWordTracking'
import OcrSuspectDetails from './OcrSuspectDetails'
import { applySuspectReplacement, liveSuspectField, planSuspectReplacement } from './ocrWordActions'

const EMPTY_SUSPECTS = []
const defaultPosition = (vp) => ({ x: Math.max(16, vp.width - 440 - 24), y: 96 })

/** Non-modal: volunteers can inspect the scan and type while reviewing. The same
 * live review result supplies highlights, this list, the status count and finish. */
export default function OcrWordReviewPanel({ review, textContainerRef, onApplyText, onSetAccepted, onClose }) {
  const [selected, setSelected] = useState(null)
  const [stale, setStale] = useState(false)
  const pendingNext = useRef(null)
  const suspects = review?.suspects || EMPTY_SUSPECTS
  const index = Math.max(0, suspects.findIndex((s) => idOf(s) === selected))
  const current = suspects[index]
  const select = useCallback((s) => {
    setSelected(idOf(s))
    const field = queryEditorField(textContainerRef.current, s?.column || 'content')
    if (!field || field.value !== review.fields[s.column].text) { setStale(true); return }
    setStale(false)
    field.focus()
    field.setSelectionRange(s.start, s.end)
    field.dispatchEvent(new Event('select', { bubbles: true }))
    revealCaret(field, s.start)
  }, [review, textContainerRef])
  useEffect(() => {
    const pending = pendingNext.current
    if (!pending || review?.fields[pending.editedColumn]?.text !== pending.value) return
    pendingNext.current = null
    const target = suspects.find((s) => s.column === pending.column && s.start === pending.start && s.text === pending.text)
    if (!target) return
    // The textarea fallback also restores its caret on a timer; select after it.
    const timer = setTimeout(() => select(target), 0)
    return () => clearTimeout(timer)
  }, [review, suspects, select])

  const replace = (suggestion) => {
    if (!current) return
    // A fetch/render or a manual keystroke may have changed the word while this
    // button was visible. Never apply an old suggestion to a new offset.
    const field = liveSuspectField(textContainerRef.current, review, current)
    const next = planSuspectReplacement(field, current, suggestion.text)
    if (!next) { setStale(true); return }
    setStale(false)
    const following = suspects.length > 1 ? suspects[(index + 1) % suspects.length] : null
    pendingNext.current = following && {
      editedColumn: current.column, value: next.value, column: following.column, text: following.text,
      start: following.start + (following.column === current.column && following.start > current.start ? next.value.length - field.value.length : 0),
    }
    if (!applySuspectReplacement(field, current, next, onApplyText)) pendingNext.current = null
  }
  const setAccepted = (word, accept) => {
    if (!liveSuspectField(textContainerRef.current, review, word) || onSetAccepted?.(word, accept) === false) {
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
          <OcrSuspectDetails word={current} onReplace={replace} />
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
