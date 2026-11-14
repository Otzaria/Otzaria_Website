'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { withStopReason } from '@/lib/adminList/bulkText'
import { isAccessLost } from '@/lib/adminList/requestErrors'
import { useBulkRun } from '@/components/admin/list/useBulkRun'
import { useBusyIds } from '@/components/admin/list/useBusyIds'
import { errorToast } from '@/components/admin/list/adminRequest'
import { useDeferredActions } from '@/components/admin/list/useDeferredActions'
import { isFindReplace, pendingParts, partiallyHandled } from '@/lib/adminSuggestions/suggestionsQuery'
import {
  NOT_PENDING_MESSAGE, PARTS_NOOP_MESSAGE, REJECT_CANCELLED_MESSAGE, approvePatternConfirm, bulkRejectConfirm, bulkResultText, conflictNotice,
  conflictToast, decidedMessage, partsConflictNotice, partsDecidedMessage, patternResultText, rejectPendingMessage,
} from '@/lib/adminSuggestions/suggestionTerms'
import * as api from './suggestionsApi'

/** המזהה של כרטיס ההצעה בעמוד — לקפיצה מ"פרטים" שבהודעה, ולהעברת פוקוס */
export const cardDomId = (id) => `suggestion-${id}`

/** הרשימה (section) — יעד הפוקוס כשנעלם הכרטיס האחרון */
export const SUGGESTIONS_LIST_ID = 'suggestions-list'

/** ב-batch, skipped אינו "טופלה" — זה כשל אצל השרת (ראו suggestionsApi.js). נספר כמו בקשה שנכשלה. */
class SkippedError extends Error {}

/**
 * הפעולות על הצעות עריכה — אחת לכל המסך (כרטיס ופעולות מרובות):
 *   אשר — מיד. ספר שנמחק (book-missing) — "הספר כבר לא קיים", לא "נכנסה לספר". אישור שלא הצליח כי הטקסט
 *     בספר השתנה — הודעה בתוך הכרטיס (notices), והודעה קופצת קצרה שמוכרזת.
 *   דחה — עם "בטל": הבקשה יוצאת רק אחרי כמה שניות (useDeferredActions), בלי חלון אישור. עד אז הכרטיס
 *     נשאר ואומר "תידחה בעוד כמה שניות", וגם בו יש "בטל" (rejecting — מזהי ההצעות שממתינות לדחייה).
 *   אישור / דחייה של חלקים — מיד; חלק שלא נכנס — הודעה בתוך הכרטיס, והוא נשאר ממתין.
 *   אשר נבחרים / דחה נבחרים — הצעה אחר הצעה, עם "X מתוך Y" ו"עצור", ובסוף הודעה אחת. מה שלא עודכן (כולל
 *     skipped של השרת) נשאר ברשימה ומסומן, לניסיון נוסף. "דחה נבחרים" — חלון אישור עם המספר.
 *   אשר את כל ההחלפות הזהות — חלון אישור (בכל הספרים).
 * שגיאת הרשאה או התחברות שפגה — המסך ננעל (locked): כל הכפתורים מושבתים, ומעל הרשימה ההסבר.
 * כרטיס שיוצא מהרשימה ובו הפוקוס — הפוקוס עובר לכרטיס הבא (או הקודם, או הרשימה), לא לתחילת הדף.
 *
 * @param {{ data: ReturnType<typeof import('@/components/admin/list/useListData').useListData>, toast: any, confirm: Function }} options
 */
export function useSuggestionActions({ data, toast, confirm }) {
  const { busy, track } = useBusyIds()
  const [notices, setNotices] = useState(() => new Map())
  const [locked, setLocked] = useState(null)
  const lockedRef = useRef(null)
  const rejectToasts = useRef(new Map())
  const deferred = useDeferredActions()
  // בזו אחר זו, כמו בשרת: אישורים במקביל לאותו ספר היו מתנגשים בעדכון הטקסט. יציאה מהמסך באמצע — עוצרת.
  const { run: runBulk, progress: bulkProgress, stopping, stop: stopBulk } = useBulkRun({ limit: 1 })
  const { setItems, refresh } = data

  const lock = useCallback((error) => {
    lockedRef.current = error
    setLocked(error)
  }, [])

  const setNotice = useCallback((ids, notice) => setNotices((m) => {
    const next = new Map(m)
    for (const id of ids) {
      if (notice) next.set(id, notice)
      else next.delete(id)
    }
    return next
  }), [])

  const remove = useCallback((ids) => {
    moveFocusFrom(ids)
    const gone = new Set(ids)
    setItems((list) => list.filter((e) => !gone.has(e._id)))
  }, [setItems])

  const fail = useCallback((error, fallback, id) => {
    // ההרשאה אבדה — המסך ננעל
    if (isAccessLost(error)) lock(error)
    toast.show({ ...errorToast(error, fallback), ...(id ? { id } : null) })
  }, [toast, lock])

  const approve = useCallback(async (edit) => {
    if (lockedRef.current) return
    setNotice([edit._id], null)
    try {
      const res = await track([edit._id], () => api.decideSuggestion(edit._id, 'approve'))
      if (res?.status === 'conflict') {
        setNotice([edit._id], conflictNotice(pendingParts(edit) > 1 || partiallyHandled(edit)))
        toast.show({ tone: 'info', message: conflictToast(edit) })
        return
      }
      remove([edit._id])
      toast.show(res?.status === 'not-pending' ? { tone: 'info', message: NOT_PENDING_MESSAGE } : decidedMessage('approve', edit, res?.status))
      refresh()
    } catch (error) {
      fail(error, 'לא הצלחנו לאשר את ההצעה.')
    }
  }, [track, setNotice, remove, toast, refresh, fail])

  /** הדחייה עצמה — כשנגמר הזמן ל"בטל" */
  const sendReject = useCallback(async (edit, toastId) => {
    rejectToasts.current.delete(edit._id)
    try {
      const res = await track([edit._id], () => api.decideSuggestion(edit._id, 'reject'))
      remove([edit._id])
      toast.show({ id: toastId, ...(res?.status === 'not-pending' ? { tone: 'info', message: NOT_PENDING_MESSAGE } : decidedMessage('reject', edit, res?.status)) })
      refresh()
    } catch (error) {
      fail(error, 'לא הצלחנו לדחות את ההצעה.', toastId)
    }
  }, [track, remove, toast, refresh, fail])

  const cancelReject = useCallback((edit) => {
    if (!deferred.cancel(edit._id)) return
    const id = rejectToasts.current.get(edit._id)
    rejectToasts.current.delete(edit._id)
    toast.show({ id, tone: 'info', message: REJECT_CANCELLED_MESSAGE })
  }, [deferred, toast])

  const reject = useCallback((edit) => {
    if (lockedRef.current || deferred.pending.has(edit._id)) return
    setNotice([edit._id], null)
    const toastId = toast.show({
      tone: 'info',
      message: rejectPendingMessage(edit),
      action: { label: 'בטל', undo: true, onClick: () => cancelReject(edit) },
    })
    rejectToasts.current.set(edit._id, toastId)
    deferred.schedule(edit._id, () => sendReject(edit, toastId), {
      // סגירת הדף בזמן ההמתנה — אותה בקשה, ב-keepalive
      onExit: () => (lockedRef.current ? undefined : api.decideSuggestion(edit._id, 'reject', undefined, { keepalive: true })),
    })
  }, [deferred, setNotice, toast, cancelReject, sendReject])

  const decide = useCallback((edit, action) => (action === 'approve' ? approve(edit) : reject(edit)), [approve, reject])

  /** @returns {Promise<boolean>} true — הבחירה בכרטיס מתנקה */
  const decideParts = useCallback(async (edit, kind, indexes) => {
    if (indexes.length === 0 || lockedRef.current) return false
    setNotice([edit._id], null)
    try {
      const res = await track([edit._id], () => api.moderateParts(edit._id, kind === 'approve' ? { approve: indexes } : { reject: indexes }))
      if (res?.status === 'not-pending') {
        remove([edit._id])
        toast.show({ tone: 'info', message: NOT_PENDING_MESSAGE })
        refresh()
        return true
      }
      if (res?.status === 'noop') {
        toast.show({ tone: 'info', message: PARTS_NOOP_MESSAGE })
        refresh()
        return true
      }
      if (res?.conflicts > 0) setNotice([edit._id], partsConflictNotice(res.conflicts))
      if (res?.status === 'approved' || res?.status === 'rejected') remove([edit._id])
      if ((res?.approved || 0) + (res?.rejected || 0) > 0) toast.show({ message: partsDecidedMessage(res) })
      refresh()
      return true
    } catch (error) {
      fail(error, 'לא הצלחנו לעדכן את החלקים שנבחרו.')
      return false
    }
  }, [track, setNotice, remove, toast, refresh, fail])

  /** @returns {Promise<string[]>} מזהי ההצעות שלא עודכנו — נשארות מסומנות לניסיון נוסף */
  const bulk = useCallback(async (action, list) => {
    if (list.length === 0 || lockedRef.current) return list.map((e) => e._id)
    if (action === 'reject' && !(await confirm(bulkRejectConfirm(list.length)))) return list.map((e) => e._id)
    const decided = []
    const conflicted = []
    const gone = []
    setNotice(list.map((e) => e._id), null)
    const run = await track(list.map((e) => e._id), () => runBulk(list, async (edit) => {
      const res = await api.batchDecideOne(action, edit._id)
      if ((res?.approved || 0) + (res?.rejected || 0) > 0) decided.push(edit)
      else if (res?.conflicts > 0) conflicted.push(edit)
      else if (res?.skipped > 0) throw new SkippedError('skipped')
      else gone.push(edit)
    }, { meta: { action } }))
    remove([...decided, ...gone].map((e) => e._id))
    for (const edit of conflicted) setNotice([edit._id], conflictNotice(pendingParts(edit) > 1 || partiallyHandled(edit)))
    refresh()
    // ההרשאה אבדה — המסך ננעל. תקלה בשרת (נעצר) — הסיכום הרגיל ("נעצר: N לא נשלחו"), ואחריו הסיבה
    if (isAccessLost(run.fatal)) {
      lock(run.fatal)
      const before = decided.length > 0 ? `${bulkResultText(action, { done: decided.length }).message} ` : ''
      toast.show({ ...errorToast(run.fatal), message: `${before}${run.fatal.message}` })
    } else {
      const { message, tone } = bulkResultText(action, {
        done: decided.length, conflicts: conflicted.length, gone: gone.length, failed: run.failed.length, stopped: run.notAttempted.length,
      })
      const first = conflicted[0]
      toast.show({
        message: run.fatal ? withStopReason(message, run.fatal) : message,
        tone: run.fatal ? 'error' : tone,
        action: first ? { label: 'פרטים', onClick: () => focusCard(first._id) } : undefined,
      })
    }
    return [...run.failed.map((f) => f.item._id), ...run.notAttempted.map((e) => e._id)]
  }, [confirm, track, runBulk, setNotice, remove, refresh, toast, lock])

  const approveSamePattern = useCallback(async (edit) => {
    if (lockedRef.current || !isFindReplace(edit) || !(await confirm(approvePatternConfirm(edit.findReplace)))) return
    try {
      const res = await track([edit._id], () => api.approvePattern(edit.findReplace))
      toast.show(patternResultText(res || {}))
      refresh()
    } catch (error) {
      fail(error, 'לא הצלחנו לאשר את ההחלפות.')
    }
  }, [confirm, track, toast, refresh, fail])

  const actions = useMemo(() => ({ decide, cancelReject, decideParts, bulk, approveSamePattern }), [decide, cancelReject, decideParts, bulk, approveSamePattern])
  return { actions, busy, rejecting: deferred.pending, notices, bulkProgress, stopping, stopBulk, locked }
}

/** "פרטים" בהודעה: גלילה לכרטיס ופוקוס בו */
function focusCard(id) {
  const card = document.getElementById(cardDomId(id))
  if (!card) return
  card.scrollIntoView({ block: 'center' })
  card.focus({ preventScroll: true })
}

/**
 * כרטיס שעומד לצאת מהרשימה ובו הפוקוס: הפוקוס עובר לכרטיס הבא שנשאר (או הקודם, או הרשימה) — לפני
 * ההסרה, כדי שלא ייפול לתחילת הדף.
 */
function moveFocusFrom(ids) {
  if (typeof document === 'undefined') return
  const gone = new Set(ids.map(cardDomId))
  const card = document.activeElement?.closest?.('[data-suggestion-card]')
  if (!card || !gone.has(card.id)) return
  const sibling = (el, dir) => {
    let next = el[dir]
    while (next && gone.has(next.id)) next = next[dir]
    return next
  }
  const target = sibling(card, 'nextElementSibling') || sibling(card, 'previousElementSibling') || document.getElementById(SUGGESTIONS_LIST_ID)
  target?.focus({ preventScroll: true })
}
