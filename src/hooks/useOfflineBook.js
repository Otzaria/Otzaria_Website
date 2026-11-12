'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CHANGED, listRecords, pageKey, readRecord, rememberOwner, saveDraft } from '@/lib/offlineBooks/store'
import { syncAll, syncRecord } from '@/lib/offlineBooks/sync'

export function useOfflineBook({ userId, bookPath, pageNumber }) {
  const key = pageKey(userId, bookPath, pageNumber)
  const [record, setRecord] = useState(null)
  const [problem, setProblem] = useState(null)
  const [connected, setConnected] = useState(true)
  const [lock, setLock] = useState('checking')
  const [syncing, setSyncing] = useState(false)
  const timer = useRef(null)
  const scheduleRetry = useRef(null)
  const latestMemory = useRef(null)
  const editHeld = useRef(false)
  const refresh = useCallback(() => {
    try { setRecord(userId ? readRecord(key) : null) }
    catch (error) { setProblem(error.message) }
  }, [key, userId])
  useEffect(() => {
    const connectivity = () => { setConnected(navigator.onLine !== false); refresh() }
    queueMicrotask(connectivity)
    window.addEventListener('storage', refresh)
    window.addEventListener(CHANGED, refresh)
    window.addEventListener('online', connectivity)
    window.addEventListener('offline', connectivity)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener(CHANGED, refresh)
      window.removeEventListener('online', connectivity)
      window.removeEventListener('offline', connectivity)
    }
  }, [refresh])
  const enabled = Boolean(record && record.key === key)
  useEffect(() => {
    if (!enabled || !navigator.locks) return
    let release, cancelled = false
    const held = new Promise(resolve => { release = resolve })
    void navigator.locks.request(`edit:${key}`, { ifAvailable: true }, async acquired => {
      if (cancelled) return
      editHeld.current = Boolean(acquired)
      setLock(acquired ? 'owned' : 'blocked')
      if (acquired) await held
    }).catch(error => { setProblem(error.message); setLock('blocked') })
    return () => { cancelled = true; editHeld.current = false; release() }
  }, [enabled, key])
  const retry = useCallback(async () => {
    clearTimeout(timer.current)
    if (latestMemory.current) {
      try { saveDraft(key, latestMemory.current); latestMemory.current = null; setProblem(null) }
      catch (error) { setProblem(error.message); return false }
    }
    setSyncing(true)
    try { return await syncRecord(key) }
    catch (error) { setProblem(error.message); return false }
    finally { setSyncing(false); refresh(); scheduleRetry.current?.() }
  }, [key, refresh])
  const save = useCallback(data => {
    if (!editHeld.current) { setProblem('העותק אינו נעול לעריכה בלשונית הזו. סגרו לשוניות נוספות ורעננו.'); return false }
    latestMemory.current = data
    try { saveDraft(key, data); latestMemory.current = null; setProblem(null) }
    catch { setProblem('האחסון המקומי מלא או חסום. השינויים האחרונים לא נשמרו במכשיר. הורידו גיבוי כעת.'); return false }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (navigator.onLine !== false) void retry() }, 2000)
    return true
  }, [key, retry])
  const saveNow = useCallback(async data => {
    if (data && !save(data)) return false
    if (navigator.onLine === false) return false
    return retry()
  }, [save, retry])
  useEffect(() => {
    if (!userId || !navigator.locks) return
    let cancelled = false, running = false, retryTimer = null, delay = 5000
    queueMicrotask(() => {
      if (cancelled) return
      try { rememberOwner(userId) } catch (error) { setProblem(error.message) }
    })
    const schedule = () => {
      if (cancelled || running || retryTimer !== null) return
      let pending = false
      try { pending = listRecords(userId).some(r => r.draft && (!r.problem || /^5/.test(r.problem.code))) } catch (error) { setProblem(error.message) }
      if (pending && navigator.onLine !== false) {
        retryTimer = setTimeout(() => { retryTimer = null; void sync() }, delay)
        delay = Math.min(delay * 2, 60000)
      } else delay = 5000
    }
    const sync = async () => {
      if (cancelled || running) return
      clearTimeout(retryTimer); retryTimer = null
      running = true
      try { await syncAll(userId) } catch (error) { setProblem(error.message) }
      finally { running = false; schedule() }
    }
    // A new edit can fail after the initial clean-page pass has already stopped.
    // Resume the same bounded backoff after that one-shot attempt, without
    // waiting for a focus/online event or polling clean pages indefinitely.
    scheduleRetry.current = schedule
    const wake = () => { delay = 5000; void sync() }
    void sync()
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    return () => {
      cancelled = true; clearTimeout(retryTimer)
      if (scheduleRetry.current === schedule) scheduleRetry.current = null
      window.removeEventListener('online', wake); window.removeEventListener('focus', wake)
    }
  }, [userId])
  useEffect(() => {
    const warn = event => {
      if (latestMemory.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('beforeunload', warn); clearTimeout(timer.current) }
  }, [])
  return {
    record, enabled, connected, lock, syncing, holdsEditLock: () => editHeld.current, problem: problem || record?.problem?.message,
    save, saveNow, flush: retry, refresh,
    locallySafe: () => { try { return !latestMemory.current && Boolean(readRecord(key)) } catch { return false } },
    backupRecord: () => latestMemory.current ? { ...record, draft: latestMemory.current } : record || readRecord(key),
    records: () => { try { return userId ? listRecords(userId) : [] } catch { return [] } },
    status: problem ? 'error' : syncing ? 'saving' : record?.draft ? (record.problem ? 'error' : 'local') : 'saved',
  }
}
