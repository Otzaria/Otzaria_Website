'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { errorToast } from '@/components/admin/list/adminRequest'
import { withStopReason } from '@/lib/adminList/bulkText'
import { isAccessLost } from '@/lib/adminList/requestErrors'
import { useBulkRun } from '@/components/admin/list/useBulkRun'
import { useDeferredActions } from '@/components/admin/list/useDeferredActions'
import { dropFields } from '@/lib/adminBookInfoScreen/bookInfoQuery'
import { bulkDeleteConfirm, publishResultText } from '@/lib/adminBookInfoScreen/bookInfoTerms'
import { postLegacy } from './bookInfoApi'

const bookName = (row) => row.approved?.bookName || 'ספר בלי שם'

/**
 * הפעולות על ההצעות הישנות — אותן בקשות כמו המסך הקודם:
 *   פתח בקשת מיזוג — { action: 'publish', selections: [{ changeId, fields }] }, הצעה אחת בכל בקשה (גם בפעולה מרובה —
 *     בזו אחר זו, עם "X מתוך Y" ו"עצור"). כשל — הסיבה בתוך הכרטיס (errors), והשאר ממשיכים.
 *   מחק — { action: 'delete', selections }: בודדת — עם "בטל" לכמה שניות (בשרת אין שחזור); מרובה — חלון אישור עם
 *     המספר, ובקשה אחת לכל הנבחרות (כמו קודם).
 * fields תמיד לא ריק (בשרת fields ריק פירושו "כל השדות").
 * הצעה שהבקשה שלה באוויר (busy) או שמחיקתה ממתינה — לא נשלחת שוב בפעולה מרובה (הקורא מסנן, וגם כאן).
 * השדות שטופלו יוצאים מההצעה (dropFields, כמו בשרת), והסימון שלה יורד. הצעה שלא נשאר בה שדה נשארת במקומה עם
 * סימון (done) עד הרענון — הכרטיסים לא זזים.
 * שגיאת הרשאה או התחברות שפגה — המסך ננעל (locked), וההודעה הקבועה במסך אומרת זאת (בלי הודעה קופצת נוספת).
 *
 * @param {{ data: { items: any[], setItems: Function }, fieldsFor: (row: any) => string[], clearFields: (id: string) => void,
 *   toast: any, confirm: Function }} options
 */
export function useLegacyActions({ data, fieldsFor, clearFields, toast, confirm }) {
  const [busy, setBusy] = useState(() => new Set())
  const [errors, setErrors] = useState(() => new Map())
  const [published, setPublished] = useState(() => new Map())
  const [done, setDone] = useState(() => new Map())
  // בזו אחר זו; יציאה מהמסך באמצע — לא נשלחות עוד
  const { run: runBulk, progress, stopping, stop: stopBulk } = useBulkRun({ limit: 1 })
  const [locked, setLocked] = useState(null)
  const lockedRef = useRef(null)
  const busyRef = useRef(new Set())
  const toasts = useRef(new Map())
  const deferred = useDeferredActions()
  const { setItems } = data

  const lock = useCallback((error) => {
    lockedRef.current = error
    setLocked(error)
  }, [])

  const mark = useCallback((setter, id, value) => setter((m) => {
    const next = new Map(m)
    if (value === undefined || value === null) next.delete(id)
    else next.set(id, value)
    return next
  }), [])

  const setBusyIds = useCallback((ids, on) => {
    for (const id of ids) {
      if (on) busyRef.current.add(id)
      else busyRef.current.delete(id)
    }
    setBusy(new Set(busyRef.current))
  }, [])

  /** השדות שטופלו יוצאים מההצעה והסימון יורד; לא נשאר כלום — ההצעה מסומנת "טופלה" ונשארת במקומה */
  const settle = useCallback((row, fields, kind) => {
    const rest = dropFields(row, fields)
    clearFields(row.id)
    if (rest) setItems((list) => list.map((r) => (r.id === row.id ? rest : r)))
    else mark(setDone, row.id, kind)
  }, [setItems, clearFields, mark])

  /** פתיחת בקשה אחת; כשל — נזרק (הקורא מחליט מה להציג) */
  const publishOne = useCallback(async (row) => {
    const fields = fieldsFor(row)
    mark(setErrors, row.id, null)
    try {
      const res = await postLegacy('publish', [{ changeId: row.id, fields }])
      setPublished((m) => new Map(m).set(row.id, [...(m.get(row.id) || []).filter((p) => p.prUrl !== res.prUrl), { prUrl: res.prUrl, prNumber: res.prNumber }]))
      settle(row, fields, 'published')
    } catch (error) {
      // הסיבה בתוך הכרטיס — חוץ מאובדן הרשאה (המסך כולו ננעל ואומר זאת)
      if (!isAccessLost(error)) mark(setErrors, row.id, error.message)
      throw error
    }
  }, [fieldsFor, mark, settle])

  const publish = useCallback(async (row) => {
    if (lockedRef.current || busyRef.current.has(row.id) || deferred.pending.has(row.id) || fieldsFor(row).length === 0) return
    setBusyIds([row.id], true)
    try {
      await publishOne(row)
      toast.show({ message: `נפתחה בקשת מיזוג ל"${bookName(row)}".` })
    } catch (error) {
      if (isAccessLost(error)) lock(error)
    } finally {
      setBusyIds([row.id], false)
    }
  }, [fieldsFor, publishOne, toast, lock, setBusyIds, deferred.pending])

  /** המחיקה עצמה — כשנגמר הזמן ל"בטל" */
  const sendDelete = useCallback(async (row, fields, toastId) => {
    toasts.current.delete(row.id)
    if (lockedRef.current) {
      toast.dismiss(toastId)
      return
    }
    setBusyIds([row.id], true)
    try {
      await postLegacy('delete', [{ changeId: row.id, fields }])
      settle(row, fields, 'deleted')
      const all = fields.length === row.changedFields.length
      toast.show({ id: toastId, message: all ? `ההצעה ל"${bookName(row)}" נמחקה.` : `השדות המסומנים בהצעה ל"${bookName(row)}" נמחקו.` })
    } catch (error) {
      if (isAccessLost(error)) {
        lock(error)
        toast.dismiss(toastId)
      } else {
        toast.show({ ...errorToast(error, 'לא הצלחנו למחוק את ההצעה.'), id: toastId })
      }
    } finally {
      setBusyIds([row.id], false)
    }
  }, [settle, toast, lock, setBusyIds])

  const cancelDelete = useCallback((row) => {
    if (!deferred.cancel(row.id)) return
    const id = toasts.current.get(row.id)
    toasts.current.delete(row.id)
    toast.show({ id, tone: 'info', message: 'המחיקה בוטלה.' })
  }, [deferred, toast])

  /** מחיקה מהכרטיס: השדות המסומנים, ובלי סימון — כל ההצעה (כמו שכתוב על הכפתור) */
  const remove = useCallback((row) => {
    const checked = fieldsFor(row)
    const fields = checked.length > 0 ? checked : [...row.changedFields]
    if (lockedRef.current || fields.length === 0 || deferred.pending.has(row.id) || busyRef.current.has(row.id)) return
    const all = fields.length === row.changedFields.length
    const toastId = toast.show({
      tone: 'info',
      message: all ? `ההצעה ל"${bookName(row)}" תימחק בעוד כמה שניות.` : `השדות המסומנים בהצעה ל"${bookName(row)}" יימחקו בעוד כמה שניות.`,
      action: { label: 'בטל', undo: true, onClick: () => cancelDelete(row) },
    })
    toasts.current.set(row.id, toastId)
    deferred.schedule(row.id, () => sendDelete(row, fields, toastId), {
      // סגירת הדף בזמן ההמתנה — אותה בקשה, ב-keepalive
      onExit: () => (lockedRef.current ? undefined : postLegacy('delete', [{ changeId: row.id, fields }], { keepalive: true })),
    })
  }, [fieldsFor, deferred, toast, cancelDelete, sendDelete])

  /** מה שאפשר לשלוח בפעולה מרובה: יש שדה מסומן, ולא באוויר / ממתין למחיקה */
  const sendable = useCallback((list) => list.filter((r) => fieldsFor(r).length > 0 && !busyRef.current.has(r.id) && !deferred.pending.has(r.id)), [fieldsFor, deferred.pending])

  const bulkPublish = useCallback(async (list) => {
    const items = sendable(list)
    if (items.length === 0 || lockedRef.current) return
    const ids = items.map((r) => r.id)
    setBusyIds(ids, true)
    let run
    try {
      run = await runBulk(items, publishOne)
    } finally {
      setBusyIds(ids, false)
    }
    // ההרשאה אבדה — המסך ננעל. תקלה בשרת (נעצר) — הסיכום ("הפעולה נעצרה"), ואחריו הסיבה
    if (isAccessLost(run.fatal)) {
      lock(run.fatal)
    } else {
      const message = publishResultText({ ok: run.done.length, failed: run.failed.length, stopped: run.stopped || Boolean(run.fatal) })
      toast.show({
        tone: run.failed.length > 0 ? 'error' : undefined,
        message: run.fatal ? withStopReason(message, run.fatal) : message,
      })
    }
  }, [sendable, runBulk, publishOne, lock, toast, setBusyIds])

  const bulkDelete = useCallback(async (list) => {
    if (sendable(list).length === 0 || lockedRef.current) return
    if (!(await confirm({ ...bulkDeleteConfirm(sendable(list).length), tone: 'danger' }))) return
    // אחרי החלון — שוב: ייתכן שבינתיים יצאה בקשה על אחת מהן
    const items = sendable(list)
    if (items.length === 0 || lockedRef.current) return
    const ids = items.map((r) => r.id)
    const selections = items.map((r) => ({ changeId: r.id, fields: fieldsFor(r) }))
    setBusyIds(ids, true)
    try {
      await postLegacy('delete', selections)
      items.forEach((r, i) => settle(r, selections[i].fields, 'deleted'))
      toast.show({ message: items.length === 1 ? 'ההצעה נמחקה.' : `${items.length} הצעות נמחקו.` })
    } catch (error) {
      if (isAccessLost(error)) lock(error)
      else toast.show(errorToast(error, 'לא הצלחנו למחוק את ההצעות.'))
    } finally {
      setBusyIds(ids, false)
    }
  }, [sendable, fieldsFor, confirm, settle, toast, lock, setBusyIds])

  /** רענון: הסימונים, הקישורים והשגיאות יורדים */
  const clear = useCallback(() => {
    setDone(new Map())
    setPublished(new Map())
    setErrors(new Map())
  }, [])

  const actions = useMemo(() => ({ publish, remove, cancelDelete, bulkPublish, bulkDelete }), [publish, remove, cancelDelete, bulkPublish, bulkDelete])
  return { actions, busy, errors, published, done, deleting: deferred.pending, progress, stopping, stopBulk, locked, clear }
}
