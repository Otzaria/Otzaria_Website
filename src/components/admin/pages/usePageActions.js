'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isFatal } from '@/lib/adminList/requestErrors'
import { runLimited } from '@/lib/runLimited'
import { useBusyIds } from '@/components/admin/list/useBusyIds'
import { errorToast, saveBlob } from '@/components/admin/list/adminRequest'
import { useDeferredActions } from '@/components/admin/list/useDeferredActions'
import {
  PAGE_DOWNLOAD_BATCH_SIZE, RELEASE_CANCELLED_MESSAGE, bulkReleaseConfirm, bulkResultText, combinedFilename, combinedText,
  releasedMessage, shouldAnnounce, skippedMessage, statusChangedMessage,
} from '@/lib/adminPagesScreen/pageTerms'
import * as api from './pagesApi'

const released = (page, result) => ({
  ...page, status: 'available', claimedBy: null, claimedById: null, claimedAt: null, completedAt: null,
  updatedAt: result.updatedAt, releasedHere: true, changedHere: true,
})

const skippedPage = (page, result) => result.page
  ? { ...result.page, changedHere: true }
  : { ...page, outdated: true }

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
 * @param {{ onChanged: (pages: any[]) => void, toast: any, confirm: Function }} options
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

  const sendRelease = useCallback(async (page) => {
    pendingPages.current.delete(page.id)
    const hadFocus = Boolean(rowOf(page.id)?.contains(document.activeElement))
    try {
      const result = await track([page.id], () => api.releasePage(page))
      if (result.outcome === 'updated') {
        onChanged([released(page, result)])
        toast.show({ message: releasedMessage(page) })
      } else {
        onChanged([skippedPage(page, result)])
        toast.show({ tone: 'error', message: skippedMessage('release', page, result.outcome) })
      }
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לשחרר את העמוד.'))
    }
    keepFocus(page.id, hadFocus)
  }, [track, onChanged, toast])

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
        return api.releasePage(page, { keepalive: true })
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

  const changeStatus = useCallback(async (page, to) => {
    const hadFocus = Boolean(rowOf(page.id)?.contains(document.activeElement))
    try {
      const result = await track([page.id], () => api.setPageStatus(page, to))
      if (result.outcome === 'updated') {
        onChanged([{ ...page, status: to, updatedAt: result.updatedAt, changedHere: true, releasedHere: false }])
        toast.show({ message: statusChangedMessage(page, to) })
      } else {
        onChanged([skippedPage(page, result)])
        toast.show({ tone: 'error', message: skippedMessage('status', page, result.outcome) })
      }
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לשנות את המצב.'))
    }
    keepFocus(page.id, hadFocus)
  }, [track, onChanged, toast])

  /** ההתקדמות, עם הכרזה רק מדי פעם (shouldAnnounce) */
  const announced = useRef(-1)
  const progress = useCallback((action, done, total) => {
    if (shouldAnnounce(announced.current, done, total)) announced.current = done
    setBulkProgress({ action, done, total, announced: Math.max(0, announced.current) })
  }, [])

  const bulkRelease = useCallback(async (list) => {
    const all = list.map((p) => p.id)
    const candidates = list.filter((p) => p.status === 'in-progress')
    if (candidates.length === 0) return all
    if (!(await confirm(bulkReleaseConfirm(candidates.length, list.length - candidates.length)))) return all
    stopRef.current = false
    announced.current = -1
    setStopping(false)
    if (!mountedRef.current) return all
    progress('release', 0, candidates.length)
    const changed = []
    let releasedCount = 0
    let skipped = 0
    let run
    try {
      run = await track(candidates.map((p) => p.id), () => runLimited(candidates, async (page) => {
        const result = await api.releasePage(page)
        if (result.outcome === 'updated') {
          releasedCount++
          changed.push(released(page, result))
        } else {
          skipped++
          changed.push(skippedPage(page, result))
        }
      }, {
        limit: 4,
        shouldStop: () => stopRef.current,
        isFatal,
        onProgress: ({ done, failed }) => progress('release', done + failed, candidates.length),
      }))
    } finally {
      setBulkProgress(null)
      setStopping(false)
    }
    onChanged(changed)
    toast.show(bulkResultText('release', {
      done: releasedCount, failed: run.failed.length, stopped: run.notAttempted.length, skipped, fatal: run.fatal?.message,
    }))
    return [...run.failed.map((f) => f.item.id), ...run.notAttempted.map((p) => p.id)]
  }, [confirm, track, onChanged, toast, progress])

  const bulkDownload = useCallback(async (list) => {
    const jobs = []
    for (let offset = 0; offset < list.length; offset += PAGE_DOWNLOAD_BATCH_SIZE) {
      jobs.push(list.slice(offset, offset + PAGE_DOWNLOAD_BATCH_SIZE))
    }
    stopRef.current = false
    announced.current = -1
    setStopping(false)
    const texts = new Map()
    let done = 0
    progress('download', 0, list.length)
    let run
    try {
      run = await track(list.map((p) => p.id), () => runLimited(jobs, async (job) => {
        try {
          for (const { id, text } of await api.selectedPageTexts(job)) texts.set(id, text)
        } finally {
          done += job.length
          progress('download', done, list.length)
        }
      }, { limit: 4, shouldStop: () => stopRef.current, isFatal }))
    } finally {
      setBulkProgress(null)
      setStopping(false)
    }
    const notSent = new Set(run.notAttempted.flat().map((page) => page.id))
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
   * @param {'release' | 'download'} action @param {any[]} list הנבחרים, בסדר שבמסך
   * @returns {Promise<string[]>} מזהי העמודים שנשארים מסומנים
   */
  const bulk = useCallback((action, list) => (action === 'release' ? bulkRelease(list) : bulkDownload(list)), [bulkRelease, bulkDownload])

  const actions = useMemo(() => ({ release, cancelRelease, download, changeStatus, bulk }), [release, cancelRelease, download, changeStatus, bulk])
  return { actions, busy, releasing: deferred.pending, bulkProgress, stopping, stopBulk }
}
