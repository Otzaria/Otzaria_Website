'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { queryAllEditorFields } from '@/lib/editor/editorField'
import { getTextareaCaretTop } from '@/lib/editorUtils'
import { fetchEditorReport } from './pageReportsApi'
import { barPlacement, locateInEditorFields, reportIdFromSearch, reportMatchesPage } from './reportFocusLogic'

const RETRIES = 20
const RETRY_MS = 150
// חלון שנפתח עם טעינת העמוד (הנחיות העריכה) לוקח את הפוקוס, ובסגירתו הבחירה בשדה אובדת — מסמנים רק
// כשאין חלון פתוח, ואחרי השהיה קצרה שבה הוא מספיק להיפתח
const SETTLE_MS = 500
const MODAL_POLL_MS = 300
const modalOpen = () => typeof document !== 'undefined' && Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))

/**
 * פתיחת העורך מתוך מסך הדיווחים (?report=<id>): טוען את הדיווח, מוצא את הסימון שלו בטקסט, ומסמן אותו
 * (פוקוס + בחירה + גלילה — המעקב בצילום הולך אחרי הבחירה כמו אחרי הסמן). קריאה בלבד: לא משנה את הטקסט.
 *
 * @param {{ containerRef: { current: HTMLElement|null }, ready: boolean, bookPath: string, pageNumber: number|string,
 *   fetchReport?: typeof fetchEditorReport }} input
 */
export function useReportFocus({ containerRef, ready, bookPath, pageNumber, fetchReport = fetchEditorReport }) {
  const pageKey = `${bookPath}\u0000${pageNumber}`
  const [state, setState] = useState(/** @type {null | FocusState} */ (null))
  const doneFor = useRef(/** @type {string|null} */ (null))

  /** השדות שבמסך: [{ el, column, value }] */
  const fields = useCallback(() => {
    const root = containerRef.current || (typeof document !== 'undefined' ? document.querySelector('.editor-container') : null)
    return queryAllEditorFields(root).map((el) => ({ el, column: el.getAttribute('data-column'), value: el.value ?? '' }))
  }, [containerRef])

  /** איתור מחדש בטקסט הנוכחי, וסימון. מחזיר את המיקום או null */
  const highlight = useCallback((report) => {
    const list = fields()
    const hit = locateInEditorFields(list, report)
    if (!hit) return null
    const field = list.find((f) => (f.column === 'right' || f.column === 'left' ? f.column : 'content') === hit.column)
    const el = /** @type {any} */ (field?.el)
    if (!el) return null
    el.focus({ preventScroll: true })
    el.setSelectionRange(hit.start, hit.end)
    // גלילה כך שהסימון באמצע השדה (כמו "חפש הבא"); הפס עובר לצד הנגדי לסימון במסך, כדי לא להסתיר אותו
    setTimeout(() => {
      const lh = Number.parseFloat(window.getComputedStyle(el).lineHeight)
      const top = getTextareaCaretTop(el, hit.start)
      el.scrollTop = Math.max(0, top - el.clientHeight / 2 + (Number.isFinite(lh) ? lh : 24))
      el.scrollIntoView?.({ block: 'nearest' })
      const y = el.getBoundingClientRect().top + top - el.scrollTop
      const placement = barPlacement(y, window.innerHeight)
      setState((s) => (s && s.placement !== placement ? { ...s, placement } : s))
    }, 10)
    return hit
  }, [fields])

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return undefined
    const id = reportIdFromSearch(window.location.search)
    const key = `${pageKey}\u0000${id}`
    if (!id || doneFor.current === key) return undefined
    doneFor.current = key
    let cancelled = false
    let timer = 0
    setState({ phase: 'loading', report: null })
    fetchReport(id).then((report) => {
      if (cancelled) return
      if (!reportMatchesPage(report, bookPath, pageNumber)) {
        setState({ phase: 'otherPage', report })
        return
      }
      // השדות (בעיקר התצוגה המעוצבת) עולים אחרי הטעינה — כמה ניסיונות קצרים
      let tries = 0
      const attempt = () => {
        if (cancelled) return
        if (modalOpen()) {
          timer = window.setTimeout(attempt, MODAL_POLL_MS)
          return
        }
        const hit = highlight(report)
        if (hit) return setState((s) => ({ phase: 'found', report, count: hit.count, placement: s?.placement }))
        tries += 1
        if (tries < RETRIES && fields().every((f) => !f.value)) {
          timer = window.setTimeout(attempt, RETRY_MS)
          return
        }
        setState({ phase: 'missing', report })
      }
      timer = window.setTimeout(attempt, SETTLE_MS)
    }).catch((err) => {
      if (!cancelled) setState({ phase: 'error', report: null, error: err?.message })
    })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [ready, pageKey, bookPath, pageNumber, fetchReport, highlight, fields])

  // מעבר לעמוד אחר — הפס של הדיווח הקודם נסגר
  const [shownFor, setShownFor] = useState(pageKey)
  if (shownFor !== pageKey) {
    setShownFor(pageKey)
    setState(null)
  }

  /** "סמן שוב" — איתור מחדש בטקסט הנוכחי */
  const rehighlight = useCallback(() => {
    if (!state?.report) return
    const hit = highlight(state.report)
    setState((s) => (s ? { ...s, phase: hit ? 'found' : 'missing', count: hit?.count } : s))
  }, [state, highlight])

  const dismiss = useCallback(() => setState(null), [])

  return { state, rehighlight, dismiss }
}

/**
 * @typedef {{ phase: 'loading'|'found'|'missing'|'otherPage'|'error', report: object|null, count?: number, error?: string,
 *   placement?: 'top'|'bottom' }} FocusState
 */
