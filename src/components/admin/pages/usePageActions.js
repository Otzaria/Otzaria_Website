'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isAccessLost, isFatal } from '@/lib/adminList/requestErrors'
import { runLimited } from '@/lib/runLimited'
import { useBusyIds } from '@/components/admin/list/useBusyIds'
import { errorToast, saveBlob } from '@/components/admin/list/adminRequest'
import { useDeferredActions } from '@/components/admin/list/useDeferredActions'
import {
  RELEASE_CANCELLED_MESSAGE, WHOLE_BOOK_FROM, bulkReleaseConfirm, bulkResultText, checkUnchanged, combinedFilename, combinedText,
  releasedMessage, shouldAnnounce, skippedMessage, splitCombinedText, statusChangedMessage,
} from '@/lib/adminPagesScreen/pageTerms'
import * as api from './pagesApi'

/** העמוד אחרי שחרור — כמו שהשרת שומר אותו. updatedAt לא משתנה כאן, כדי שהשורה לא תזוז במיון לפי "עודכן". */
const released = (page) => ({ ...page, status: 'available', claimedBy: null, claimedById: null, releasedHere: true, changedHere: true })

/** "בטל" מיד אחרי "שחרר" (לחיצה כפולה — הכפתור מתחלף במקום) — לא נחשב */
const DOUBLE_CLICK_MS = 600

// שדה שמקלידים בו — שם Ctrl+Z מבטל הקלדה
function isTextEntry(target) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA') return true
  return target.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''].includes((target.getAttribute('type') || '').toLowerCase())
}

const rowOf = (id) => document.querySelector(`[data-row="${CSS.escape(id)}"]`)

/** הפוקוס היה בשורה, והכפתור שעליו הוא עמד נעלם — ל-⋮ של אותה שורה (לא לתחילת הדף) */
function keepFocus(id, hadFocus) {
  if (!hadFocus) return
  setTimeout(() => {
    const active = document.activeElement
    if (active && active !== document.body && active.isConnected) return
    rowOf(id)?.querySelector('[data-row-menu] button')?.focus({ preventScroll: true })
  }, 0)
}

/**
 * הפעולות על עמודים — אחת לכל המסך (שורה ופעולות מרובות):
 *   שחרר — עם "בטל": הבקשה יוצאת רק אחרי כמה שניות (useDeferredActions), בלי חלון אישור. עד אז בשורה "בטל"
 *     (ו-Ctrl+Z). יציאה מהמסך שולחת מיד את מה שממתין; סגירת הדף / רענון — בבקשה ששורדת אותם (keepalive).
 *   שנה מצב — אחרי חלון האישור (ChangeStatusDialog).
 *   הורד טקסט — הטקסט של העמוד כקובץ.
 *   שחרר נבחרים — חלון אישור עם המספר, בדיקה, ואז עמוד אחר עמוד עם "X מתוך Y" ו"עצור", ובסוף הודעה אחת.
 *   הורד טקסט (נבחרים) — קובץ אחד; עמודים רבים מאותו ספר — בבקשה אחת לכל הספר (download-batch).
 * לפני כל שחרור ושינוי מצב — בדיקה טרייה בשרת (loadCurrent, לפי ספר): נשלח רק עמוד שעדיין במצב ובשיוך שהיו
 * ברשימה. השרת מעדכן בלי תנאי, ולכן בלי הבדיקה רשימה ישנה הייתה מחזירה ל"פנוי" עמוד שכבר הושלם או נלקח מחדש.
 * מה שלא הצליח (או לא נשלח בגלל "עצור") — נשאר מסומן, לניסיון נוסף.
 *
 * @param {{ onChanged: (pages: any[]) => void, toast: any, confirm: Function }} options
 *   onChanged — עדכון מקומי של עמודים ברשימה (אחרי שחרור / שינוי / בדיקה שמצאה שינוי); הם נשארים במקומם
 */
export function usePageActions({ onChanged, toast, confirm }) {
  const { busy, track } = useBusyIds()
  const [bulkProgress, setBulkProgress] = useState(null)
  const [stopping, setStopping] = useState(false)
  const stopRef = useRef(false)
  const mountedRef = useRef(true)
  const pendingPages = useRef(new Map()) // id → { page, at } — לפי סדר הלחיצה (Ctrl+Z מבטל את האחרון)
  const deferred = useDeferredActions()
  const stopBulk = useCallback(() => {
    stopRef.current = true
    setStopping(true)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      // יציאה מהמסך באמצע פעולה מרובה — לא שולחים עוד
      mountedRef.current = false
      stopRef.current = true
    }
  }, [])

  /**
   * הבדיקה לפני שליחה: מה שעדיין כמו ברשימה — ok; מה שהשתנה — skipped (עם המצב העדכני, אם ידוע).
   * @param {any[]} pages @param {string} status
   */
  const check = useCallback(async (pages, status = '') => {
    const current = await api.loadCurrent({ books: pages.map((p) => p.bookName), status })
    const ok = []
    const skipped = []
    for (const page of pages) {
      const fresh = current.get(page.id)
      // בבדיקה לפי מצב: עמוד שלא חזר — כבר לא במצב הזה (לא בהכרח נמחק)
      const result = checkUnchanged(page, fresh) === 'gone' && status ? 'changed' : checkUnchanged(page, fresh)
      if (result === 'ok') ok.push(page)
      else skipped.push({ page, result, fresh })
    }
    return { ok, skipped }
  }, [])

  /** מה שהבדיקה מצאה שהשתנה — מוצג כמו שהוא עכשיו (או "השתנה" כשלא ידוע), במקום */
  const showSkipped = useCallback((skipped) => {
    onChanged(skipped.map(({ page, fresh }) => (fresh ? { ...fresh, changedHere: true } : { ...page, outdated: true })))
  }, [onChanged])

  /** השחרור עצמו — כשנגמר הזמן ל"בטל": בדיקה, ואז שליחה */
  const sendRelease = useCallback(async (page) => {
    pendingPages.current.delete(page.id)
    const hadFocus = Boolean(rowOf(page.id)?.contains(document.activeElement))
    try {
      const outcome = await track([page.id], async () => {
        const { skipped } = await check([page])
        if (skipped.length > 0) return skipped[0]
        await api.releasePage(page)
        return null
      })
      if (outcome) {
        showSkipped([outcome])
        toast.show({ tone: 'error', message: skippedMessage('release', page, outcome.result) })
      } else {
        onChanged([released(page)])
        toast.show({ message: releasedMessage(page) })
      }
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לשחרר את העמוד.'))
    }
    keepFocus(page.id, hadFocus)
  }, [track, check, showSkipped, onChanged, toast])

  const cancelRelease = useCallback((page) => {
    const entry = pendingPages.current.get(page.id)
    if (entry && Date.now() - entry.at < DOUBLE_CLICK_MS) return
    if (!deferred.cancel(page.id)) return
    pendingPages.current.delete(page.id)
    toast.show({ tone: 'info', message: RELEASE_CANCELLED_MESSAGE })
    // הפוקוס היה על "בטל", שמתחלף עכשיו ב"שחרר" באותה שורה
    setTimeout(() => rowOf(page.id)?.querySelector('[data-release]')?.focus({ preventScroll: true }), 0)
  }, [deferred, toast])

  const release = useCallback((page) => {
    if (deferred.pending.has(page.id) || page.status !== 'in-progress') return
    pendingPages.current.set(page.id, { page, at: Date.now() })
    // סגירת הדף / רענון בזמן ההמתנה — נשלח מיד, בבקשה ששורדת את הסגירה (useDeferredActions: onExit)
    deferred.schedule(page.id, () => sendRelease(page), {
      onExit: () => {
        pendingPages.current.delete(page.id)
        api.releaseOnExit([page])
      },
    })
    // "שחרר" מתחלף ב"בטל" באותה שורה — הפוקוס עובר אליו (וקורא המסך מכריז עליו)
    setTimeout(() => rowOf(page.id)?.querySelector('[data-cancel-release]')?.focus({ preventScroll: true }), 0)
  }, [deferred, sendRelease])

  // Ctrl+Z / ⌘Z — מבטל את השחרור האחרון שעוד ממתין (מכל מקום בדף, חוץ משדה הקלדה)
  const pendingCount = deferred.pending.size
  useEffect(() => {
    if (pendingCount === 0) return undefined
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.code !== 'KeyZ') return
      if (isTextEntry(event.target)) return
      const last = [...pendingPages.current.values()].pop()
      if (!last) return
      event.preventDefault()
      cancelRelease(last.page)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pendingCount, cancelRelease])

  const download = useCallback(async (page) => {
    try {
      await track([page.id], () => api.downloadPage(page))
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו להוריד את הטקסט של העמוד.'))
    }
  }, [track, toast])

  /** "שנה מצב" — אחרי חלון האישור: בדיקה, ואז אותו גוף כמו "ערוך סטטוס" במסך הקודם */
  const changeStatus = useCallback(async (page, to) => {
    const hadFocus = Boolean(rowOf(page.id)?.contains(document.activeElement))
    try {
      const outcome = await track([page.id], async () => {
        const { skipped } = await check([page])
        if (skipped.length > 0) return skipped[0]
        await api.setPageStatus(page, to)
        return null
      })
      if (outcome) {
        showSkipped([outcome])
        toast.show({ tone: 'error', message: skippedMessage('status', page, outcome.result) })
      } else {
        onChanged([{ ...page, status: to, changedHere: true, releasedHere: false }])
        toast.show({ message: statusChangedMessage(page, to) })
      }
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לשנות את המצב.'))
    }
    keepFocus(page.id, hadFocus)
  }, [track, check, showSkipped, onChanged, toast])

  /** ההתקדמות, עם הכרזה רק מדי פעם (shouldAnnounce) */
  const announced = useRef(-1)
  const progress = useCallback((action, done, total, phase = 'run') => {
    if (phase === 'run' && shouldAnnounce(announced.current, done, total)) announced.current = done
    setBulkProgress({ action, phase, done, total, announced: Math.max(0, announced.current) })
  }, [])

  const bulkRelease = useCallback(async (list) => {
    const all = list.map((p) => p.id)
    const candidates = list.filter((p) => p.status === 'in-progress')
    if (candidates.length === 0) return all
    if (!(await confirm(bulkReleaseConfirm(candidates.length, list.length - candidates.length)))) return all
    stopRef.current = false
    announced.current = -1
    setStopping(false)
    progress('release', 0, candidates.length, 'check')
    let run
    let skipped = []
    try {
      let ok
      try {
        // עד 8 ספרים — כל העמודים של כל ספר (המצב המדויק של מה שהשתנה); יותר — רק העמודים בעבודה (פחות בקשות)
        const manyBooks = new Set(candidates.map((p) => p.bookName)).size > 8
        ;({ ok, skipped } = await track(candidates.map((p) => p.id), () => check(candidates, manyBooks ? 'in-progress' : '')))
      } catch (error) {
        toast.show(errorToast(error, 'לא הצלחנו לבדוק את המצב העדכני של העמודים. לא שוחרר דבר.'))
        return all
      }
      showSkipped(skipped)
      if (stopRef.current) {
        toast.show(bulkResultText('release', { done: 0, stopped: ok.length, skipped: skipped.length }))
        return ok.map((p) => p.id)
      }
      progress('release', 0, ok.length)
      run = await track(ok.map((p) => p.id), () => runLimited(ok, (page) => api.releasePage(page), {
        limit: 4,
        shouldStop: () => stopRef.current,
        isFatal,
        onProgress: ({ done, failed }) => progress('release', done + failed, ok.length),
      }))
    } finally {
      setBulkProgress(null)
      setStopping(false)
    }
    onChanged(run.done.map(released))
    toast.show(bulkResultText('release', {
      done: run.done.length, failed: run.failed.length, stopped: run.notAttempted.length, skipped: skipped.length, fatal: run.fatal?.message,
    }))
    // שוחררו / דולגו — יוצאים מהבחירה. מה שנכשל או לא נשלח — נשאר. מי שלא היה בעבודה — יוצא.
    return [...run.failed.map((f) => f.item.id), ...run.notAttempted.map((p) => p.id)]
  }, [confirm, track, check, showSkipped, onChanged, toast, progress])

  /**
   * הורדה: עמודים רבים מאותו ספר (WHOLE_BOOK_FROM ומעלה) — הספר כולו בבקשה אחת, ומתוכו רק הנבחרים; השאר —
   * עמוד-עמוד. סדר העמודים בקובץ — כמו במסך.
   */
  const bulkDownload = useCallback(async (list, query) => {
    const byBook = new Map()
    for (const p of list) {
      if (!byBook.has(p.bookName)) byBook.set(p.bookName, [])
      byBook.get(p.bookName).push(p)
    }
    const jobs = []
    for (const [bookName, pages] of byBook) {
      if (pages.length >= WHOLE_BOOK_FROM) jobs.push({ bookName, pages })
      else for (const page of pages) jobs.push({ pages: [page] })
    }
    stopRef.current = false
    announced.current = -1
    setStopping(false)
    const texts = new Map()
    let done = 0
    progress('download', 0, list.length)
    const fetchOne = async (page) => {
      try {
        texts.set(page.id, await api.pageText(page))
      } catch (error) {
        // עמוד שנכשל — לא בקובץ, ונשאר מסומן (נספר בסוף לפי מה שאין לו טקסט)
        if (isFatal(error)) throw error
      }
    }
    let run
    try {
      run = await track(list.map((p) => p.id), () => runLimited(jobs, async (job) => {
        try {
          if (job.bookName) {
            let map = new Map()
            try {
              map = splitCombinedText(await api.bookText(job.bookName, query))
            } catch (error) {
              // הקובץ של הספר נכשל — ממשיכים עמוד-עמוד (חוץ מהתחברות שפגה / אין הרשאה). גם בתקלת שרת: קובץ של
              // ספר שלם כבד בהרבה מעמוד אחד, ולכן מנסים עמוד-עמוד לפני שעוצרים
              if (isAccessLost(error)) throw error
            }
            const missing = []
            for (const page of job.pages) {
              if (map.has(page.number)) texts.set(page.id, map.get(page.number))
              else missing.push(page)
            }
            for (const page of missing) {
              if (stopRef.current) break
              await fetchOne(page)
            }
          } else {
            await fetchOne(job.pages[0])
          }
        } finally {
          done += job.pages.length
          progress('download', done, list.length)
        }
      }, { limit: 4, shouldStop: () => stopRef.current, isFatal }))
    } finally {
      setBulkProgress(null)
      setStopping(false)
    }
    const notSent = new Set(run.notAttempted.flatMap((job) => job.pages.map((p) => p.id)))
    const entries = list.filter((p) => texts.has(p.id)).map((p) => ({ bookName: p.bookName, number: p.number, text: texts.get(p.id) }))
    const failed = list.filter((p) => !texts.has(p.id) && !notSent.has(p.id))
    const partialFile = entries.length > 0 && entries.length < list.length
    if (entries.length > 0 && mountedRef.current) {
      saveBlob(new Blob([combinedText(entries)], { type: 'text/plain;charset=utf-8' }), combinedFilename(entries.length, list.length))
    }
    if (!mountedRef.current) {
      toast.show({ tone: 'info', message: 'ההורדה נעצרה, כי יצאת מהמסך. לא ירד קובץ.' })
    } else {
      toast.show(bulkResultText('download', { done: entries.length, failed: failed.length, stopped: notSent.size, fatal: run.fatal?.message, partialFile }))
    }
    return [...failed.map((p) => p.id), ...notSent]
  }, [track, toast, progress])

  /**
   * @param {'release' | 'download'} action @param {any[]} list הנבחרים, בסדר שבמסך @param {any} query הסינון (להורדת ספר שלם)
   * @returns {Promise<string[]>} מזהי העמודים שנשארים מסומנים
   */
  const bulk = useCallback((action, list, query) => (action === 'release' ? bulkRelease(list) : bulkDownload(list, query)), [bulkRelease, bulkDownload])

  const actions = useMemo(() => ({ release, cancelRelease, download, changeStatus, bulk }), [release, cancelRelease, download, changeStatus, bulk])
  return { actions, busy, releasing: deferred.pending, bulkProgress, stopping, stopBulk }
}
