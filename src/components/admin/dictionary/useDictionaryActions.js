'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { errorToast } from '@/components/admin/list/adminRequest'
import { withStopReason } from '@/lib/adminList/bulkText'
import { isAccessLost } from '@/lib/adminList/requestErrors'
import { useBulkRun } from '@/components/admin/list/useBulkRun'
import { useDeferredActions } from '@/components/admin/list/useDeferredActions'
import { applyRequest, pairKey, userRequest, wordRequestCount, wordRequests, wordView } from '@/lib/adminDictionaryScreen/dictionaryQuery'
import {
  CANCELLED_TOAST, bulkApproveConfirm, bulkResultText, doneToast, failedToast, pendingToast, removeUserConfirm, userDoneToast, userFailedToast,
} from '@/lib/adminDictionaryScreen/dictionaryTerms'
import { sendWordRequest } from './dictionaryApi'

/**
 * הפעולות על מילים — אחת לכל המסך (שורה ופעולות מרובות):
 *   אשר / דלג / הסר — עם "בטל": הבקשות יוצאות רק אחרי כמה שניות (useDeferredActions), בלי חלון אישור. ל"אשר"
 *     ול"הסר" אין ביטול בשרת; ל"דלג" יש (action: 'unskip'), אבל המסך הקודם לא שלח אותו ולכן גם כאן לא — "בטל" הוא
 *     רשת הביטחון.
 *   כל פעולה על מילה — בקשה לכל משתמש שהוסיף אותה (wordRequests), בזו אחר זו; ההודעה אומרת לכמה משתמשים. מה שהצליח
 *     נכנס לנתונים מיד (applyRequest — כמו המסך הקודם), גם אם בקשה אחרת נכשלה.
 *   פעולה על משתמש אחד (ברשימה "מי הוסיף") — בקשה אחת, כמו שורה במסך הקודם (actUser): "אשר" ו"דלג" מיד, "הסר" — עם
 *     חלון אישור (כמו קודם).
 *   מילה שטופלה נשארת בשורה שלה עם סימון ("נוספה למילון") עד הרענון — השורות לא זזות (handled).
 *   אשר / דלג על הנבחרים — מילה אחר מילה, עם "X מתוך Y" ו"עצור"; "אשר" — עם חלון אישור עם המספר.
 * שגיאת הרשאה או התחברות שפגה — המסך ננעל (locked), וההודעה הקבועה במסך אומרת זאת (בלי הודעה קופצת נוספת).
 *
 * @param {{ data: { data: { entries: any[], skipped: any[] }, setData: Function, refresh: () => Promise<boolean> },
 *   toast: any, confirm: Function }} options
 */
export function useDictionaryActions({ data, toast, confirm }) {
  const [busy, setBusy] = useState(() => new Set())
  const [busyUsers, setBusyUsers] = useState(() => new Set())
  const busyUsersRef = useRef(new Set())
  const [handled, setHandled] = useState(() => new Map())
  const [pendingActions, setPendingActions] = useState(() => new Map())
  // מילה אחר מילה; יציאה מהמסך באמצע — לא נשלחות עוד
  const { run: runBulk, progress: bulkProgress, stopping, stop: stopBulk } = useBulkRun({ limit: 1 })
  const [locked, setLocked] = useState(null)
  const lockedRef = useRef(null)
  const toasts = useRef(new Map())
  const deferred = useDeferredActions()
  const { setData, refresh } = data

  const lock = useCallback((error) => {
    lockedRef.current = error
    setLocked(error)
  }, [])

  const setBusyWords = useCallback((words, on) => setBusy((s) => {
    const next = new Set(s)
    for (const w of words) {
      if (on) next.add(w)
      else next.delete(w)
    }
    return next
  }), [])

  const setPendingAction = useCallback((word, action) => setPendingActions((m) => {
    const next = new Map(m)
    if (action) next.set(word, action)
    else next.delete(word)
    return next
  }), [])

  /**
   * כל הבקשות של מילה אחת, בזו אחר זו. מה שהצליח — לנתונים. כשל — נזרק (עם partial: חלק כבר עודכן).
   * @returns {Promise<void>}
   */
  const runWord = useCallback(async (word, action) => {
    const requests = wordRequests(word, action)
    let sent = 0
    for (const request of requests) {
      try {
        await sendWordRequest(request)
      } catch (error) {
        error.partial = sent > 0
        throw error
      }
      sent += 1
      setData((d) => applyRequest(d, request))
    }
    setHandled((m) => new Map(m).set(word.word, { view: wordView(word), snapshot: word, result: action }))
  }, [setData])

  const fail = useCallback((error, action, word, toastId) => {
    if (error?.partial) refresh()
    // ההרשאה אבדה — המסך ננעל
    if (isAccessLost(error)) {
      lock(error)
      if (toastId) toast.dismiss(toastId)
      return
    }
    const fallback = failedToast(action, word.word, error?.partial)
    toast.show({ ...errorToast(error, fallback), message: fallback, ...(toastId ? { id: toastId } : null) })
  }, [toast, lock, refresh])

  /** הפעולה עצמה — כשנגמר הזמן ל"בטל" */
  const send = useCallback(async (word, action, toastId) => {
    toasts.current.delete(word.word)
    setPendingAction(word.word, null)
    if (lockedRef.current) {
      toast.dismiss(toastId)
      return
    }
    setBusyWords([word.word], true)
    try {
      await runWord(word, action)
      toast.show({ id: toastId, message: doneToast(action, word.word) })
    } catch (error) {
      fail(error, action, word, toastId)
    } finally {
      setBusyWords([word.word], false)
    }
  }, [runWord, toast, fail, setBusyWords, setPendingAction])

  const cancel = useCallback((word) => {
    if (!deferred.cancel(word.word)) return
    setPendingAction(word.word, null)
    const id = toasts.current.get(word.word)
    toasts.current.delete(word.word)
    toast.show({ id, tone: 'info', message: CANCELLED_TOAST })
  }, [deferred, toast, setPendingAction])

  const act = useCallback((word, action) => {
    if (lockedRef.current || deferred.pending.has(word.word) || handled.has(word.word)) return
    const toastId = toast.show({
      tone: 'info',
      message: pendingToast(action, word.word, wordRequestCount(word, action)),
      action: { label: 'בטל', undo: true, onClick: () => cancel(word) },
    })
    toasts.current.set(word.word, toastId)
    setPendingAction(word.word, action)
    deferred.schedule(word.word, () => send(word, action, toastId), {
      // סגירת הדף בזמן ההמתנה — אותן בקשות (אחת לכל משתמש), ב-keepalive; מסך נעול — כלום.
      // כאן כולן יוצאות יחד, לא בזו אחר זו כמו ב-runWord: ב-pagehide הדף כבר נסגר, ובקשה שמחכה לסיום הקודמת
      // (await) כבר לא תצא — רק מה שנשלח מיד שורד. זה בסדר: כל בקשה עומדת בפני עצמה, ו-add-global הוא upsert
      // על מילה עם אינדקס ייחודי (MongoDB מנסה שוב upsert שנתקל במפתח כפול), כך ששתיים במקביל לא יוצרות כפילות.
      // הגוף של כל אחת קטן, הרבה מתחת למכסת ה-64KB המשותפת של keepalive.
      onExit: () => {
        if (lockedRef.current) return undefined
        return Promise.all(wordRequests(word, action).map((request) => sendWordRequest(request, { keepalive: true })))
      },
    })
  }, [deferred, handled, toast, cancel, send, setPendingAction])

  /** @returns {Promise<string[]>} המילים שלא עודכנו — נשארות מסומנות לניסיון נוסף */
  const bulk = useCallback(async (action, list) => {
    const keys = list.map((w) => w.word)
    if (list.length === 0 || lockedRef.current) return keys
    if (action === 'approve' && !(await confirm(bulkApproveConfirm(list.length)))) return keys
    setBusyWords(keys, true)
    let run
    try {
      run = await runBulk(list, (word) => runWord(word, action), { meta: { action } })
    } finally {
      setBusyWords(keys, false)
    }
    if (run.failed.some((f) => f.error?.partial)) refresh()
    // ההרשאה אבדה — המסך ננעל. תקלה בשרת (נעצר) — הסיכום ("הפעולה נעצרה"), ואחריו הסיבה
    if (isAccessLost(run.fatal)) {
      lock(run.fatal)
    } else {
      const message = bulkResultText(action, { ok: run.done.length, failed: run.failed.length, stopped: run.stopped || Boolean(run.fatal) })
      toast.show({
        tone: run.failed.length > 0 ? 'error' : undefined,
        message: run.fatal ? withStopReason(message, run.fatal) : message,
      })
    }
    return [...run.failed.map((f) => f.item.word), ...run.notAttempted.map((w) => w.word)]
  }, [confirm, runBulk, runWord, refresh, lock, toast, setBusyWords])

  /**
   * פעולה על משתמש אחד: { action, userId, word } אחת. מה שהצליח — לנתונים; כשזה היה המשתמש האחרון של המילה
   * (והמילה יוצאת מהרשימה) — השורה נשארת במקומה עם סימון, כמו בפעולה על המילה.
   */
  const actUser = useCallback(async (word, user, action) => {
    const key = pairKey(user.userId, user.word)
    const request = userRequest(user, action)
    if (!request || lockedRef.current || busyUsersRef.current.has(key) || deferred.pending.has(word.word) || handled.has(word.word)) return
    const name = user.name || user.email || 'המשתמש'
    if (action === 'remove' && !(await confirm(removeUserConfirm(word.word, name)))) return
    if (lockedRef.current) return
    busyUsersRef.current.add(key)
    setBusyUsers(new Set(busyUsersRef.current))
    try {
      await sendWordRequest(request)
      setData((d) => applyRequest(d, request))
      if (action !== 'skip' && word.users.length === 1) setHandled((m) => new Map(m).set(word.word, { view: wordView(word), snapshot: word, result: action }))
      toast.show({ message: userDoneToast(action, word.word, name) })
    } catch (error) {
      if (isAccessLost(error)) lock(error)
      else toast.show({ ...errorToast(error), message: userFailedToast(action, word.word, name) })
    } finally {
      busyUsersRef.current.delete(key)
      setBusyUsers(new Set(busyUsersRef.current))
    }
  }, [confirm, deferred.pending, handled, setData, toast, lock])

  /** רענון: הסימונים של מה שטופל יורדים, והמילים מסתדרות מחדש */
  const clearHandled = useCallback(() => setHandled(new Map()), [])

  const actions = useMemo(() => ({ act, cancel, bulk, actUser }), [act, cancel, bulk, actUser])
  return { actions, busy, busyUsers, handled, pendingActions, bulkProgress, stopping, stopBulk, locked, clearHandled }
}
