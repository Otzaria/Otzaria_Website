'use client'

// שורות (ומרווחי מילים) מתמונת העמוד עצמה — פרופיל הקרנה בדפדפן (תוכנית §5.1, מקור 4).
// טוען את התמונה (same-origin — אחרת ה-canvas "מוכתם" והניתוח מוותר בשקט), מקטין אותה
// (analysisScale), ומריץ את הניתוח ב-Web Worker (scanProfile.worker.js — ImageBitmap מוקטן +
// OffscreenCanvas), ובלעדיו בזמן פנוי ב-main thread (requestIdleCallback; בלעדיו — setTimeout).
// התוצאה נשמרת בזיכרון ובמטמון הלשונית (sessionStorage) לפי כתובת התמונה; גם בפגיעה במטמון
// התמונה נטענת כדי לוודא שממדיה לא השתנו (אותה כתובת, תמונה שהוחלפה) — ואם השתנו, ניתוח מחדש.
// גם בלי ניתוח (analyze=false) — מחזיר את ממדי התמונה הטבעיים, לצורך המרת הקואורדינטות.

import { useEffect, useMemo, useState } from 'react'
import { FP_SIZE, analysisScale, grayFingerprint, profileFitsImage, profileFromRgba } from '@/lib/editor/scanProfile'

// v3: הפרופיל שמור עם טביעת האצבע של התמונה (fp)
const STORAGE_PREFIX = 'scanProfile:v3:'
export const SCAN_LINES_MEMORY_LIMIT = 24
export const SCAN_ANALYSIS_DELAY_MS = 120
const memory = new Map()

// מטמון קטן ומהיר לעמודים האחרונים בלבד. sessionStorage נשאר מטמון הלשונית הארוך יותר;
// ה-Map אינו רשאי לגדול לאורך יום הגהה שלם.
function remember(url, profile) {
  memory.delete(url)
  memory.set(url, profile)
  while (memory.size > SCAN_LINES_MEMORY_LIMIT) memory.delete(memory.keys().next().value)
}

function readStored(url) {
  if (memory.has(url)) {
    const profile = memory.get(url)
    remember(url, profile) // נגיעה = האחרון בשימוש (LRU)
    return profile
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + url)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (!p || !Array.isArray(p.size) || !Array.isArray(p.lines)) return null
    remember(url, p)
    return p
  } catch {
    return null
  }
}

function store(url, profile) {
  remember(url, profile)
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + url, JSON.stringify(profile))
  } catch {
    // מלא / חסום — הזיכרון מספיק ללשונית הזו
  }
}

function dropStored(url) {
  memory.delete(url)
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + url)
  } catch {
    // אחסון חסום — הזיכרון כבר נוקה
  }
}

/** לטסטים: ניקוי המטמון שבזיכרון */
export function clearScanLinesCache() {
  memory.clear()
  resetWorker()
  workerBroken = false
}

/** לטסטים: סדר ה-LRU, מהישן לחדש. */
export function scanLinesMemoryCacheKeys() {
  return [...memory.keys()]
}

// ---- Web Worker (אחד משותף לכל הדף; נכשל פעם אחת → main thread מכאן והלאה) ----
let worker = null
let workerBroken = false
let seq = 0
const pending = new Map()

function resetWorker() {
  worker?.terminate()
  worker = null
  for (const done of pending.values()) done(null)
  pending.clear()
}

function getWorker() {
  if (workerBroken || typeof window === 'undefined') return null
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('../lib/editor/scanProfile.worker.js', import.meta.url), { type: 'module' })
  } catch {
    workerBroken = true
    return null
  }
  worker.onmessage = (e) => {
    const { id, profile } = e.data || {}
    const done = pending.get(id)
    pending.delete(id)
    done?.(profile || null)
  }
  worker.onerror = () => {
    workerBroken = true
    resetWorker()
  }
  return worker
}

/**
 * ניתוח ב-Worker: ההקטנה (createImageBitmap עם resize) והניתוח מחוץ ל-main thread.
 * null — אין תמיכה / ה-Worker נכשל (הקורא נופל ל-analyzeImage).
 * @param {HTMLImageElement} img
 * @param {number} w
 * @param {number} h
 * @returns {Promise<import('@/lib/editor/scanProfile').ScanProfile|null>}
 */
export async function analyzeOffThread(img, w, h, { signal } = {}) {
  if (signal?.aborted) return null
  const wk = getWorker()
  if (!wk) return null
  const scale = analysisScale(w, h)
  const dw = Math.max(1, Math.round(w * scale))
  const dh = Math.max(1, Math.round(h * scale))
  let bitmap
  try {
    bitmap = await createImageBitmap(img, { resizeWidth: dw, resizeHeight: dh, resizeQuality: 'medium' })
  } catch {
    return null
  }
  if (signal?.aborted) {
    bitmap.close?.()
    return null
  }
  return new Promise((resolve) => {
    const id = ++seq
    const finish = (profile) => {
      signal?.removeEventListener('abort', abort)
      resolve(profile)
    }
    const abort = () => {
      // profileFromRgba הוא חישוב סינכרוני, ולכן אי אפשר לבטל job בתוך worker עסוק.
      // terminate מבטיח שעמוד מעבר לא יחסום את העמוד הנוכחי; הקריאה הבאה תיצור worker חדש.
      resetWorker()
    }
    pending.set(id, finish)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      wk.postMessage({ id, bitmap, w, h }, [bitmap])
    } catch {
      pending.delete(id)
      signal?.removeEventListener('abort', abort)
      bitmap.close?.()
      resolve(null)
    }
  })
}

const idle = (fn) => {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1500 })
    return () => window.cancelIdleCallback?.(id)
  }
  const id = setTimeout(fn, 30)
  return () => clearTimeout(id)
}

/**
 * טביעת האצבע של התמונה (scanProfile.grayFingerprint): ציור ל-canvas של FP_SIZE×FP_SIZE —
 * אותה דרך בשמירה ובאימות, כך שאותה תמונה נותנת אותה טביעת אצבע. null כשאין canvas.
 * @param {HTMLImageElement|ImageBitmap} img
 * @returns {number[]|null}
 */
export function imageFingerprint(img) {
  try {
    const N = FP_SIZE
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N })
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, N, N)
    return grayFingerprint(ctx.getImageData(0, 0, N, N).data, N, N)
  } catch {
    return null
  }
}

/**
 * ניתוח תמונה טעונה: הקטנה ל-canvas, getImageData, profileFromRgba.
 * @param {HTMLImageElement|ImageBitmap} img
 * @param {number} w רוחב טבעי
 * @param {number} h גובה טבעי
 */
export async function analyzeImage(img, w, h) {
  const scale = analysisScale(w, h)
  const dw = Math.max(1, Math.round(w * scale))
  const dh = Math.max(1, Math.round(h * scale))
  let src = img
  if (scale < 1 && typeof createImageBitmap === 'function') {
    try {
      src = await createImageBitmap(img, { resizeWidth: dw, resizeHeight: dh, resizeQuality: 'medium' })
    } catch {
      src = img
    }
  }
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(dw, dh) : Object.assign(document.createElement('canvas'), { width: dw, height: dh })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no 2d context')
  ctx.drawImage(src, 0, 0, dw, dh)
  if (src !== img && typeof src.close === 'function') src.close()
  const data = ctx.getImageData(0, 0, dw, dh)
  return profileFromRgba(data.data, dw, dh, { scale: dw / w })
}

/**
 * @param {string|null|undefined} url כתובת תמונת העמוד
 * @param {{ analyze?: boolean }} [opts] analyze=false — רק ממדים, בלי ניתוח
 * @returns {{ size: [number, number]|null, profile: import('@/lib/editor/scanProfile').ScanProfile|null,
 *   status: 'idle'|'loading'|'ready'|'error' }}
 */
export function useScanLines(url, { analyze = true } = {}) {
  const [state, setState] = useState({ url: null, size: null, profile: null, failed: false })
  // מונה פסילות: פרופיל שמור שלא תאם את התמונה נזרק, והמטמון נקרא מחדש
  const [invalidated, setInvalidated] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidated: קריאה מחדש אחרי dropStored
  const cached = useMemo(() => (url && typeof window !== 'undefined' ? readStored(url) : null), [url, invalidated])

  useEffect(() => {
    if (!url || typeof window === 'undefined') return undefined
    let cancelled = false
    let cancelIdle = null
    let analysisTimer = null
    const analysisController = new AbortController()
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      const w = img.naturalWidth
      const h = img.naturalHeight
      // טביעת האצבע — כדי לזהות תמונה שהוחלפה באחרת באותן מידות באותה כתובת
      const fp = w > 0 && h > 0 && (cached || analyze) ? imageFingerprint(img) : null
      if (cached) {
        // פגיעה במטמון: רק אימות שהתמונה בכתובת הזו היא עדיין אותה תמונה
        if (w > 0 && h > 0 && !profileFitsImage(cached, w, h, fp)) {
          dropStored(url)
          setState({ url: null, size: null, profile: null, failed: false })
          setInvalidated((n) => n + 1)
        }
        return
      }
      setState((s) => ({ ...(s.url === url ? s : { profile: null, failed: false }), url, size: w > 0 && h > 0 ? [w, h] : null }))
      if (!analyze || !(w > 0 && h > 0)) return
      const done = (analyzed) => {
        if (cancelled) return
        const profile = fp ? { ...analyzed, fp } : analyzed
        store(url, profile)
        setState({ url, size: [w, h], profile, failed: false })
      }
      const onMain = () => {
        cancelIdle = idle(async () => {
          try {
            const profile = await analyzeImage(img, w, h)
            done(profile)
          } catch {
            if (!cancelled) setState((s) => ({ ...s, url, failed: true }))
          }
        })
      }
      // המתנה קצרה מונעת ניתוח של עמודים שהם רק תחנות מעבר בניווט מהיר.
      analysisTimer = setTimeout(() => {
        analysisTimer = null
        if (cancelled) return
        analyzeOffThread(img, w, h, { signal: analysisController.signal }).then((profile) => {
          if (cancelled) return
          if (profile) done(profile)
          else onMain()
        }, onMain)
      }, SCAN_ANALYSIS_DELAY_MS)
    }
    img.onerror = () => {
      if (!cancelled && !cached) setState({ url, size: null, profile: null, failed: true })
    }
    img.src = url
    return () => {
      cancelled = true
      if (analysisTimer != null) clearTimeout(analysisTimer)
      analysisController.abort()
      cancelIdle?.()
      img.onload = null
      img.onerror = null
    }
  }, [url, analyze, cached])

  if (!url) return { size: null, profile: null, status: 'idle' }
  if (cached) return { size: cached.size, profile: cached, status: 'ready' }
  const mine = state.url === url ? state : { size: null, profile: null, failed: false }
  const status = mine.profile ? 'ready' : mine.failed ? 'error' : analyze ? 'loading' : 'idle'
  return { size: mine.size, profile: mine.profile, status }
}
