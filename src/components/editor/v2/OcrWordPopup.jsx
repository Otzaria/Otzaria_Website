'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '@/components/ui/Button'
import { queryEditorField } from '@/lib/editor/editorField'
import { adjacentSuspect, placeSuspectPopup, suspectAt, suspectId } from '@/lib/editor/suspectPopup'
import { revealCaret } from '@/hooks/useWordTracking'
import OcrSuspectDetails from './OcrSuspectDetails'
import { applySuspectReplacement, liveSuspectField, planSuspectReplacement } from './ocrWordActions'
import { rectVisibleIn, suspectAtPoint, suspectRects, unionRect } from './suspectGeometry'

// חלונית קטנה על המילה החשודה עצמה, לצד החלונית "מילים חשודות" (שנשארת כמו שהיא). אותם נתונים
// (review מ-usePageTracking) ואותן פעולות (ocrWordActions: בדיקת "הטקסט לא השתנה", החלפה דרך
// מסלול העריכה של העורך, onSetAccepted של הדף). שום מילה לא משתנה בלי לחיצה.
//
// מתי נפתחת: עמידה בעכבר על מילה מסומנת (השהיה קצרה), לחיצה/מגע שמשאירים את הסמן בתוך מילה כזו,
// או F8 / Shift+F8 (המילה הבאה / הקודמת — הסמן בוחר אותה והפוקוס עובר לחלונית). השכבה המודגשת
// עצמה אינה מקבלת אירועים — המילה מאותרת לפי הסמן או לפי מקום העכבר (suspectGeometry).
// מתי נסגרת: Esc (הפוקוס חוזר לטקסט), הקלדה בשדה, הסמן שיוצא מהמילה, לחיצה במקום אחר, גלילה
// שמוציאה את המילה מהתצוגה, עזיבת המילה והחלונית בעכבר (כשנפתחה בעמידה), ובחירת פעולה.

const HOVER_OPEN_MS = 350
const HOVER_CLOSE_MS = 250
const FIELD = 'textarea, [data-rich-textarea]'
const columnOf = (field) => field.getAttribute('data-column') || 'content'
const NO_CLOSE_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Escape', 'F8', 'Tab'])

export default function OcrWordPopup({ review, textContainerRef, onApplyText, onSetAccepted }) {
  const [open, setOpen] = useState(/** @type {null | {id: string, column: string, via: 'hover'|'click'|'key'}} */ (null))
  const [stale, setStale] = useState(false)
  const [place, setPlace] = useState(null)
  const popRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const timers = useRef({ open: 0, close: 0, raf: 0 })
  const hoverId = useRef(null)
  const focusOnOpen = useRef(false)
  const current = open ? (review?.fields?.[open.column]?.suspects || []).find((s) => suspectId(s) === open.id) || null : null
  const latest = useRef({ review, open, current })
  useLayoutEffect(() => { latest.current = { review, open, current } })

  const container = () => textContainerRef.current
  // המילים החשודות של השדה — רק כשהטקסט החי הוא בדיוק הטקסט שנבדק
  const liveSuspects = (field) => {
    const f = latest.current.review?.fields?.[columnOf(field)]
    return f && f.text === field.value ? f.suspects : []
  }
  const fieldAt = (target) => {
    const field = target instanceof Element ? target.closest(FIELD) : null
    return field && container()?.contains(field) ? field : null
  }

  const clearTimer = (k) => { clearTimeout(timers.current[k]); timers.current[k] = 0 }
  const close = useCallback(() => {
    clearTimer('open'); clearTimer('close')
    hoverId.current = null
    focusOnOpen.current = false
    setOpen(null)
    setStale(false)
  }, [])
  const openOn = useCallback((s, via) => {
    clearTimer('open'); clearTimer('close')
    setStale(false)
    // מילה אחרת — המיקום הקודם לא תקף (נמדד מחדש לפני הציור)
    if (latest.current.open?.id !== suspectId(s)) setPlace(null)
    setOpen((o) => (o?.id === suspectId(s) && o.via === via ? o : { id: suspectId(s), column: s.column, via }))
  }, [])
  // הפוקוס חוזר לשדה; pos — מקום הסמן (ברירת מחדל: סוף המילה), או [start, end] לבחירה
  const focusField = (s, sel) => {
    const field = queryEditorField(container(), s.column)
    if (!field) return
    field.focus()
    const [a, b] = Array.isArray(sel) ? sel : [s.end, s.end]
    if (field.value.length >= b) field.setSelectionRange(a, b)
  }

  // המילה נעלמה (תוקנה, אושרה, הטקסט השתנה) — אין על מה להציג; סוגרים גם את המצב, אחרת החלונית
  // הייתה צצה שוב כשהמילה חוזרת (Ctrl+Z) גם כשהעכבר והסמן כבר רחוקים
  if (open && !current) {
    setOpen(null)
    setStale(false)
  }

  // מיקום: צמוד למילה, מתחת או מעל, לא עליה; נמדד מחדש בגלילה ובשינוי גודל
  const reposition = useCallback(() => {
    const { open: o, current: s } = latest.current
    const pop = popRef.current
    if (!o || !s || !pop) return
    const field = queryEditorField(container(), s.column)
    const anchor = unionRect(suspectRects(field, s))
    if (!anchor || !rectVisibleIn(field, anchor)) { close(); return }
    const size = { width: pop.offsetWidth, height: pop.scrollHeight }
    setPlace(placeSuspectPopup(anchor, size, { width: window.innerWidth, height: window.innerHeight }))
  }, [close]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (open && current) reposition()
  }, [open, current, reposition])
  useEffect(() => {
    if (!open) return undefined
    const t = timers.current
    const later = () => {
      cancelAnimationFrame(t.raf)
      t.raf = requestAnimationFrame(reposition)
    }
    window.addEventListener('scroll', later, true)
    window.addEventListener('resize', later)
    return () => {
      cancelAnimationFrame(t.raf)
      window.removeEventListener('scroll', later, true)
      window.removeEventListener('resize', later)
    }
  }, [open, reposition])

  // נפתחה מהמקלדת — הפוקוס לפעולה הראשונה (ההצעה הראשונה, או "המילה תקינה")
  useEffect(() => {
    if (!open || !place || !focusOnOpen.current) return
    focusOnOpen.current = false
    const pop = popRef.current
    const first = pop?.querySelector('[aria-label^="החלף ב"], [data-popup-accept]')
    ;(first || pop)?.focus()
  }, [open, place])

  useEffect(() => {
    const t = timers.current
    const inPopup = (target) => target instanceof Node && !!popRef.current?.contains(target)

    // לחיצה/מגע: הסמן נשאר בתוך מילה מסומנת — פותח; במקום אחר — סוגר
    const onClick = (e) => {
      if (inPopup(e.target)) return
      const field = fieldAt(e.target)
      if (!field) { if (latest.current.open) close(); return }
      const caret = field.selectionStart
      const s = field.selectionEnd === caret ? suspectAt(liveSuspects(field), columnOf(field), caret) : null
      if (s) openOn(s, 'click')
      else if (latest.current.open) close()
    }

    // עמידה בעכבר: השהיה קצרה לפני פתיחה; יציאה מהמילה ומהחלונית — סגירה (רק כשנפתחה כך)
    let pending = null
    const hoverCheck = () => {
      t.raf = 0
      const e = pending
      pending = null
      if (!e) return
      const { open: o } = latest.current
      if (inPopup(e.target)) { clearTimer('close'); return }
      const field = e.buttons ? null : fieldAt(e.target)
      const s = field ? suspectAtPoint(field, liveSuspects(field), e.clientX, e.clientY) : null
      const id = s ? suspectId(s) : null
      if (id && o?.id === id) { clearTimer('close'); clearTimer('open'); hoverId.current = id; return }
      if (id !== hoverId.current) {
        clearTimer('open')
        hoverId.current = id
        // חלונית שנפתחה מהמקלדת (הפוקוס בה) לא מוחלפת בעמידה
        if (s && o?.via !== 'key') t.open = setTimeout(() => openOn(s, 'hover'), HOVER_OPEN_MS)
      }
      if (!id && o?.via === 'hover' && !t.close) t.close = setTimeout(close, HOVER_CLOSE_MS)
    }
    const onMove = (e) => {
      pending = e
      if (!t.raf) t.raf = requestAnimationFrame(hoverCheck)
    }

    const onInput = (e) => { if (latest.current.open && fieldAt(e.target)) close() }

    const onKeyDown = (e) => {
      const { open: o, current: s, review: r } = latest.current
      if (e.key === 'Escape' && o) {
        if (e.defaultPrevented) return
        e.preventDefault()
        e.stopPropagation()
        const back = inPopup(document.activeElement)
        close()
        if (back && s) focusField(s, [s.start, s.end])
        return
      }
      if (e.key !== 'F8' || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return
      const field = fieldAt(e.target)
      if (!field && !inPopup(e.target)) return
      e.preventDefault()
      // רק טורים שהטקסט בהם הוא הטקסט שנבדק — לא קופצים להיסט ישן
      const live = (r?.suspects || []).filter((x) => liveSuspectField(container(), r, x))
      const from = o && s ? { suspect: s } : field ? { column: columnOf(field), offset: field.selectionStart } : null
      const next = from && adjacentSuspect(live, from, e.shiftKey ? -1 : 1)
      if (!next) return
      const target = liveSuspectField(container(), r, next)
      target.focus()
      target.setSelectionRange(next.start, next.end)
      revealCaret(target, next.start, { smooth: false })
      focusOnOpen.current = true
      openOn(next, 'key')
    }

    // הסמן זז מחוץ למילה (חצים, Home/End...) — החלונית שנפתחה בלחיצה נסגרת
    const onKeyUp = (e) => {
      const { open: o, current: s } = latest.current
      if (!o || o.via === 'key' || NO_CLOSE_KEYS.has(e.key)) return
      const field = fieldAt(e.target)
      if (!field || !s) return
      const caret = field.selectionStart
      if (columnOf(field) !== s.column || field.selectionEnd !== caret || caret < s.start || caret > s.end) close()
    }

    document.addEventListener('click', onClick)
    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('input', onInput, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp)
      clearTimeout(t.open); clearTimeout(t.close); cancelAnimationFrame(t.raf)
    }
  }, [close, openOn]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !current || typeof document === 'undefined') return null

  const replace = (suggestion) => {
    const s = current
    const field = liveSuspectField(container(), review, s)
    const next = planSuspectReplacement(field, s, suggestion.text)
    if (!next) { setStale(true); return }
    close()
    applySuspectReplacement(field, s, next, onApplyText, { collapse: true })
  }
  const accept = () => {
    const s = current
    if (!liveSuspectField(container(), review, s) || onSetAccepted?.(s, true) === false) { setStale(true); return }
    close()
    focusField(s)
  }

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label={`הצעות למילה ${current.text}`}
      tabIndex={-1}
      dir="rtl"
      data-ocr-word-popup=""
      onMouseEnter={() => clearTimer('close')}
      onMouseLeave={() => { if (open.via === 'hover') { clearTimer('close'); timers.current.close = setTimeout(close, HOVER_CLOSE_MS) } }}
      style={{ top: place?.top ?? 0, left: place?.left ?? 0, maxHeight: place?.maxHeight, visibility: place ? 'visible' : 'hidden' }}
      className="custom-scrollbar fixed z-(--z-overlay) w-80 max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-(--dialog-radius) border border-outline-variant bg-(--dialog-bg) p-3 text-on-surface shadow-(--dialog-shadow) outline-none"
    >
      <div className="mb-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-title-md">{current.text}</p>
        <Button variant="text" size="sm" iconOnly icon="close" aria-label="סגירה" onClick={() => { close(); focusField(current, [current.start, current.end]) }} />
      </div>
      {stale && <p role="status" className="text-body-sm">הטקסט השתנה. סגרו ופתחו שוב את המילה.</p>}
      <OcrSuspectDetails word={current} onReplace={replace} limit={3} />
      {onSetAccepted && <div className="mt-3 border-t border-outline-variant pt-2">
        <Button variant="tonal" icon="check" onClick={accept} data-popup-accept="">המילה תקינה</Button>
      </div>}
      <p className="mt-2 text-body-sm text-on-surface-variant">F8 — המילה הבאה · Esc — סגירה</p>
    </div>,
    document.body
  )
}
