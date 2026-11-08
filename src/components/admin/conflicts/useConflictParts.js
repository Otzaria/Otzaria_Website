'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useDeferredActions } from '@/components/admin/list/useDeferredActions'
import { partPendingMessage } from '@/lib/adminSuggestions/conflictTerms'
import { loadConflictDiff, resolveConflictPart } from './conflictsApi'

/**
 * החלקים השונים של ספר אחד, וההחלטה עליהם חלק-חלק. הלוגיקה של השליחה הועברה מהעמוד הקודם (ConflictDiff):
 * תור שמעובד בזה אחר זה — בקשה אחת בכל רגע לאותו ספר, כדי שכתיבות לא ידרסו זו את זו; הזיהוי לשרת לפי תוכן
 * (fullBefore/fullAfter); כשל — התור מתבטל, ההבדלים נטענים מחדש, והודעת שגיאה (onError).
 *
 * ההבדלים נטענים רק כשפותחים את הספר (load), כדי שהרשימה לא תריץ השוואה על כל הספרים.
 *
 * בחירה בחלק (resolvePart) לא נשלחת מיד: הנוסח השני נמחק בלי דרך חזרה, ולכן יש כמה שניות של "בטל" —
 * בהודעה הקופצת ובחלק עצמו (cancelPart). החלק נשאר במקומו ומסומן (decisions: waiting → saving → saved), כך
 * שלחיצה כפולה לא מכריעה את החלק הבא, והרשימה לא קופצת מתחת לעכבר. כשכל החלקים המוצגים נשמרו ונשארו עוד
 * בשרת (יותר מ-30 חלקים) — נטענת המנה הבאה.
 *
 * @param {any} book
 * @param {{ onResolved?: (bookId: string, data: any) => void, onError?: (error: any) => void }} options
 */
export function useConflictParts(book, { onResolved, onError }) {
  const bookId = book._id
  const toast = useToast()
  const deferred = useDeferredActions()
  const [state, setState] = useState({ loading: false, changes: null, changeCount: 0, error: null, loaded: false })
  const [decisions, setDecisions] = useState(() => new Map())
  const queueRef = useRef([])      // תור הכרעות שהזמן ל"בטל" שלהן נגמר {change, strategy}
  const drainingRef = useRef(false) // האם מעבד התור פעיל (סריאלי)
  const latestRef = useRef({ changes: null, decisions: new Map() }) // מראה ל-state עבור drain
  const toastIds = useRef(new Map())
  const bookRef = useRef(book)
  const onResolvedRef = useRef(onResolved)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    bookRef.current = book
    onResolvedRef.current = onResolved
    onErrorRef.current = onError
  })

  const setDecision = useCallback((change, decision) => setDecisions((m) => {
    const next = new Map(m)
    if (decision) next.set(change, decision)
    else next.delete(change)
    latestRef.current = { ...latestRef.current, decisions: next }
    return next
  }), [])

  /** ביטול כל הבחירות שעוד לא יצאו (כשל, טעינה מחדש, פעולה על כל הספר) */
  const cancelWaiting = useCallback(() => {
    for (const [change, id] of toastIds.current) {
      deferred.cancel(change)
      toast.dismiss(id)
    }
    toastIds.current.clear()
  }, [deferred, toast])

  const loadDiff = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    return loadConflictDiff(bookId)
      .then((data) => {
        const fresh = new Map()
        latestRef.current = { changes: data.changes, decisions: fresh }
        setDecisions(fresh)
        setState({ loading: false, changes: data.changes, changeCount: data.changeCount, error: null, loaded: true })
        return data
      })
      .catch((error) => {
        setState({ loading: false, changes: null, changeCount: 0, error, loaded: false })
        return null
      })
  }, [bookId])

  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    let lastData = null
    try {
      while (queueRef.current.length) {
        const { change, strategy } = queueRef.current.shift()
        try {
          const data = await resolveConflictPart(bookId, change, strategy)
          lastData = data
          setDecision(change, { strategy, state: 'saved' })
          onResolvedRef.current?.(bookId, data) // עדכון המונה בהורה / הסרת הספר כשנפתר
        } catch (e) {
          // כשל — מבטלים את התור (וגם מה שעוד מחכה ל"בטל"), מסנכרנים מחדש ועוצרים
          queueRef.current = []
          cancelWaiting()
          const data = await loadDiff()
          if (data) onResolvedRef.current?.(bookId, { resolved: false, conflictCount: data.changeCount })
          onErrorRef.current?.(e)
          return // ה-finally יאפס drainingRef; דילוג על טעינת המנה הבאה
        }
      }
      // מנה הבאה: כל החלקים המוצגים נשמרו, אבל בשרת נשארו עוד (יותר מ-30 חלקים)
      const { changes, decisions: current } = latestRef.current
      const allSaved = (changes || []).every((c) => current.get(c)?.state === 'saved')
      if (lastData && !lastData.resolved && allSaved) await loadDiff()
    } finally {
      drainingRef.current = false
    }
  }, [bookId, loadDiff, setDecision, cancelWaiting])

  const cancelPart = useCallback((change) => {
    if (!deferred.cancel(change)) return
    toast.dismiss(toastIds.current.get(change))
    toastIds.current.delete(change)
    setDecision(change, null)
  }, [deferred, toast, setDecision])

  const resolvePart = useCallback((change, strategy) => {
    // לחיצה נוספת על אותו חלק (כפולה, או על הנוסח השני) — כבר נבחר
    if (latestRef.current.decisions.has(change)) return
    setDecision(change, { strategy, state: 'waiting' })
    const number = (latestRef.current.changes || []).indexOf(change) + 1
    const id = toast.show({
      tone: 'info',
      message: partPendingMessage(bookRef.current, number, strategy),
      action: { label: 'בטל', undo: true, onClick: () => cancelPart(change) },
    })
    toastIds.current.set(change, id)
    deferred.schedule(change, () => {
      toast.dismiss(id)
      toastIds.current.delete(change)
      setDecision(change, { strategy, state: 'saving' })
      queueRef.current.push({ change, strategy })
      drain()
    })
  }, [deferred, toast, setDecision, cancelPart, drain])

  return { ...state, decisions, load: loadDiff, resolvePart, cancelPart, cancelWaiting }
}
