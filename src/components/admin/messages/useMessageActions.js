'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bulkDeleteConfirm, bulkResultText, deleteConfirm, deleteSentConfirm } from '@/lib/adminMessagesScreen/messageTerms'
import { withStopReason } from '@/lib/adminList/bulkText'
import { isAccessLost } from '@/lib/adminList/requestErrors'
import { useBulkRun } from '@/components/admin/list/useBulkRun'
import { useBusyIds } from '@/components/admin/list/useBusyIds'
import { errorToast } from '@/components/admin/list/adminRequest'
import { useDeferredActions } from '@/components/admin/list/useDeferredActions'
import { refreshAdminBadgeCounts } from '@/components/admin/shell/useAdminBadgeCounts'
import * as api from './messagesApi'

/**
 * הפעולות על הודעות — אחת לכל המסך (שורה, מגירה ופעולות מרובות):
 *   סמן כנקרא — מיד ברשימה, עם "בטל" בהודעה הקופצת; הבקשה יוצאת רק אחרי כמה שניות (אין בשרת "סמן כלא נקרא").
 *     רענון באמצע לא מחזיר את "חדש" (localRead); לחיצה חוזרת בזמן ההמתנה — שולחת מיד.
 *   מחק לצמיתות — חלון אישור (אין אשפה), ואחריו הודעה.
 *   השב — הבקשה, ואחריה רענון שקט (השרת מסמן את השיחה כנקראה).
 *   מרובות (סמן כנקרא, מחק לצמיתות) — 4 בקשות במקביל (אין נקודת קצה מרובה), "X מתוך Y" ו"עצור", ובסוף הודעה
 *   אחת שאומרת כמה הצליחו, כמה לא וכמה לא נשלחו. מחזירות את מזהי מי שנכשל — כדי שישארו מסומנים. יציאה מהמסך
 *   באמצע עוצרת אותן (useBulkRun); המסך שואל קודם "לעצור ולצאת?".
 * כל מה שמשנה "חדש" מרענן את המונה שבסרגל. busy — מזהי הודעות עם בקשה פתוחה.
 *
 * @param {{ data: { setData: Function, refresh: () => Promise<boolean> }, toast: any, confirm: Function,
 *   onRemoved?: (ids: string[]) => void }} options
 */
export function useMessageActions({ data, toast, confirm, onRemoved }) {
  const { setData, refresh } = data
  const { busy, track } = useBusyIds()
  // progress — { action, done, total }; יציאה מהמסך באמצע — לא נשלחות עוד בקשות
  const { run: runBulk, progress, stopping, stop: stopBulk } = useBulkRun()
  const deferred = useDeferredActions()
  const onRemovedRef = useRef(onRemoved)
  useEffect(() => { onRemovedRef.current = onRemoved })

  const patch = useCallback((ids, change) => {
    const set = new Set(ids)
    setData((list) => list.map((m) => (set.has(m.id) ? { ...m, ...change } : m)))
  }, [setData])
  const drop = useCallback((ids) => {
    const set = new Set(ids)
    setData((list) => list.filter((m) => !set.has(m.id)))
    onRemovedRef.current?.(ids)
  }, [setData])

  /** הרצה על כמה הודעות: עצירה, התקדמות (כשיש יותר מאחת), ונעילת השורות */
  const runOn = useCallback((action, list, worker) => (
    track(list.map((m) => m.id), () => runBulk(list, worker, { meta: { action }, showProgress: list.length > 1 }))
  ), [track, runBulk])

  // ----- סמן כנקרא (אחת): מיד ברשימה, "בטל", והבקשה אחרי כמה שניות -----
  // localRead — מה שסומן כאן ועוד לא אושר בשרת (ממתין ל"בטל", או בדרך). המסך מציג אותן כנקראו גם אם רענון באמצע
  // מחזיר מהשרת "לא נקראה" (conversations.withLocalRead). אחרי הצלחה — status:'read' בנתונים עצמם, ויוצאת מכאן.
  const [localRead, setLocalRead] = useState(() => new Set())
  const setRead = useCallback((id, on) => {
    setLocalRead((prev) => {
      if (prev.has(id) === on) return prev
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const markRead = useCallback((message) => {
    if (message.status !== 'unread') return
    if (deferred.pending.has(message.id)) {
      deferred.flush(message.id)
      return
    }
    setRead(message.id, true)
    deferred.schedule(message.id, async () => {
      try {
        await track([message.id], () => api.markRead(message.id))
        patch([message.id], { status: 'read' })
        setRead(message.id, false)
        refreshAdminBadgeCounts()
      } catch (error) {
        setRead(message.id, false)
        toast.show(errorToast(error, 'לא הצלחנו לסמן כנקרא.'))
      }
    }, { onExit: () => api.markRead(message.id, { keepalive: true }) }) // סגירת הדף בזמן ההמתנה — נשלח בכל זאת
    toast.show({
      message: 'השיחה סומנה כנקראה',
      action: {
        label: 'בטל',
        undo: true,
        onClick: () => {
          if (deferred.cancel(message.id)) setRead(message.id, false)
        },
      },
    })
  }, [deferred, patch, track, toast, setRead])

  // ----- מחק לצמיתות (שיחה אחת) -----
  const remove = useCallback(async (message) => {
    if (!(await confirm(deleteConfirm(message.subject)))) return false
    deferred.cancel(message.id)
    try {
      await track([message.id], () => api.deleteMessage(message.id))
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו למחוק את השיחה.'))
      return false
    }
    drop([message.id])
    toast.show({ message: 'השיחה נמחקה' })
    refreshAdminBadgeCounts()
    return true
  }, [confirm, deferred, track, drop, toast])

  // ----- מחק לצמיתות (נשלחו: הודעה לנמען אחד, או לכל הנמענים של "כל המשתמשים") -----
  const removeSent = useCallback(async (group) => {
    if (!(await confirm(deleteSentConfirm(group)))) return false
    const run = await runOn('delete', group.messages, (m) => api.deleteMessage(m.id))
    drop(run.done.map((m) => m.id))
    if (run.fatal || run.failed.length > 0 || run.notAttempted.length > 0) {
      const left = run.failed.length + run.notAttempted.length
      toast.show(isAccessLost(run.fatal)
        ? errorToast(run.fatal, 'לא הצלחנו למחוק את ההודעה.')
        : { tone: 'error', message: left === group.messages.length ? 'לא הצלחנו למחוק את ההודעה.' : `ההודעה נמחקה אצל חלק מהנמענים. ${left} נשארו.` })
      refresh()
      return false
    }
    toast.show({ message: 'ההודעה נמחקה' })
    return true
  }, [confirm, runOn, drop, toast, refresh])

  // ----- מרובות: סמן כנקרא / מחק לצמיתות. מחזיר את המזהים שנכשלו (נשארים מסומנים) -----
  const bulk = useCallback(async (action, messages) => {
    const list = action === 'read' ? messages.filter((m) => m.status === 'unread') : messages
    const skipped = messages.length - list.length
    if (action === 'read' && list.length === 0) {
      toast.show({ tone: 'info', message: 'כל השיחות שנבחרו כבר נקראו.' })
      return []
    }
    if (action === 'delete' && !(await confirm(bulkDeleteConfirm(list.length)))) return null
    for (const m of list) {
      deferred.cancel(m.id)
      setRead(m.id, false)
    }
    const worker = action === 'read' ? (m) => api.markRead(m.id) : (m) => api.deleteMessage(m.id)
    const run = await runOn(action, list, worker)
    const doneIds = run.done.map((m) => m.id)
    if (action === 'read') patch(doneIds, { status: 'read' })
    else drop(doneIds)
    // ההרשאה אבדה — מה שהספיק, וההסבר (עם "התחבר"). תקלה בשרת (נעצר) — הסיכום: מה שלא נשלח נספר עם מה שנכשל
    // (שניהם נשארים בבחירה), ואחריו הסיבה
    if (isAccessLost(run.fatal)) {
      const before = doneIds.length > 0 ? `${bulkResultText(action, { done: doneIds.length }).message} ` : ''
      toast.show({ ...errorToast(run.fatal), message: `${before}${run.fatal.message}` })
    } else if (run.fatal) {
      const result = bulkResultText(action, { done: doneIds.length, failed: run.failed.length + run.notAttempted.length, skipped })
      toast.show({ tone: 'error', message: withStopReason(result.message, run.fatal) })
    } else {
      toast.show(bulkResultText(action, { done: doneIds.length, failed: run.failed.length, stopped: run.notAttempted.length, skipped }))
    }
    if (doneIds.length > 0) refreshAdminBadgeCounts()
    if (run.failed.length > 0) refresh()
    return [...run.failed.map((f) => f.item.id), ...run.notAttempted.map((m) => m.id)]
  }, [confirm, deferred, runOn, patch, drop, toast, refresh, setRead])

  // ----- השב -----
  const reply = useCallback(async (message, text) => {
    deferred.cancel(message.id)
    await track([message.id], () => api.reply(message.id, text))
    toast.show({ message: 'התשובה נשלחה' })
    refreshAdminBadgeCounts()
    refresh()
  }, [deferred, track, toast, refresh])

  return useMemo(
    () => ({ markRead, remove, removeSent, bulk, reply, busy, progress, stopping, stopBulk, pendingRead: deferred.pending, localRead }),
    [markRead, remove, removeSent, bulk, reply, busy, progress, stopping, stopBulk, deferred.pending, localRead]
  )
}
