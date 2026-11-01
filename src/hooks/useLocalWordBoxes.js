'use client'

// זיהוי תיבות מילים בדפדפן (tesseract.js המאוחסן אצלנו) לעמוד שאין לו פריסת OCR, ושמירתן בשרת
// (/api/page-layout) כדי שהמתנדב הבא לא יחכה. תוכנית העורך §5.1 מקור 3, §5.5.
//
//   const { status, progress, source, error, detect } = useLocalWordBoxes({ pageId, imageUrl })
//
// בטעינה (pageId) — GET לתיבות שמורות. הזיהוי עצמו רק בלחיצה (detect — "זהה מילים בעמוד").
// status: 'idle' (אין pageId) | 'checking' | 'ready' (יש source) | 'none' (אין שמורות — אפשר לזהות)
//         | 'detecting' | 'saving'
// source: המבנה האחיד של trackingSource (level/source/size/lines) או null.
// progress: 0..1 בזמן הזיהוי. error: הודעה בעברית או null (גם לצד source, למשל כשהשמירה נכשלה).
// משתמשים רק בגיאומטריה (תיבות + ודאות); טקסט המילה נשמר כעזר ליישור בלבד.

import { useCallback, useEffect, useRef, useState } from 'react'
import tesseractPkg from 'tesseract.js/package.json'
import { fromTesseract, splitColumnStreams } from '@/lib/editor/trackingSource'
import { storedToTrack, trackToStored } from '@/lib/editor/pageLayoutValidation'
import { tesseractAssetUrls } from '@/lib/editor/tesseractAssets'
import { versionFor, nextVersionRecord } from './layoutVersion'

const API = '/api/page-layout'
const MSG = {
  load: 'טעינת התיבות השמורות נכשלה',
  image: 'טעינת תמונת העמוד נכשלה',
  lang: 'קובץ השפה לזיהוי מילים חסר בשרת — פנה למנהל האתר',
  detect: 'זיהוי המילים נכשל. נסה לרענן את הדף או להשתמש בדפדפן אחר',
  empty: 'לא זוהו מילים בעמוד',
  save: 'המילים זוהו, אך השמירה בשרת נכשלה — הן יישמרו בזיהוי הבא',
  conflict: 'התיבות של העמוד עודכנו בינתיים על ידי משתמש אחר',
  imageChanged: 'תמונת העמוד הוחלפה מאז שנטענה — טען את העמוד מחדש',
}
/** הודעה עדינה (לא שגיאה): זוהה בעמוד שלא נתפס — שמור רק בזיכרון ובמטמון הלשונית */
export const LOCAL_ONLY_NOTICE = 'נשמר רק אצלך עד שתתפוס את העמוד'

// detect() מבטל את ריצת ה-GET הנוכחית. לכן בזמן בדיקת פריסה שמורה אין להתחיל
// OCR חדש: זו עבודה כבדה שעלולה גם להישמר עם expectedVersion מיושן.
export const canStartLocalWordDetection = (status) => !['checking', 'detecting', 'saving'].includes(status)

// מטמון הלשונית (sessionStorage) לזיהוי שלא נשמר בשרת — שורד רענון, לא עובר למשתמש/לשונית אחרים
const LOCAL_KEY = (pageId) => `local-word-boxes:${pageId}`

/**
 * @param {string} pageId @param {string|null|undefined} imageUrl
 * @returns {object|null} הפריסה השמורה (מבנה trackToStored) — רק אם נשמרה לאותה תמונה
 */
export function readLocalWords(pageId, imageUrl) {
  try {
    const entry = JSON.parse(window.sessionStorage.getItem(LOCAL_KEY(pageId)) || 'null')
    if (!entry?.stored || (entry.imageUrl ?? null) !== (imageUrl ?? null)) return null
    return entry.stored
  } catch {
    return null
  }
}

/** @param {string} pageId @param {string|null|undefined} imageUrl @param {object|null} stored — null מוחק */
export function writeLocalWords(pageId, imageUrl, stored) {
  try {
    if (stored) window.sessionStorage.setItem(LOCAL_KEY(pageId), JSON.stringify({ imageUrl: imageUrl ?? null, stored }))
    else window.sessionStorage.removeItem(LOCAL_KEY(pageId))
  } catch { /* מטמון חסום / מלא — נשאר בזיכרון בלבד */ }
}

// תמונה קטנה מוגדלת לזיהוי (tesseract מדויק יותר ב-~300dpi); התיבות מוחזרות לממדים הטבעיים
export function detectionScale(width) {
  if (!(width > 0) || width >= 1500) return 1
  return Math.min(2, 2400 / width)
}

// ברירת המחדל: התמונה כפי שהדפדפן מציג אותה (EXIF מוחל) → canvas מוגדל לפי הצורך
async function defaultLoadImage(url, { signal } = {}) {
  const res = await fetch(url, { signal, credentials: 'same-origin' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const bitmap = await createImageBitmap(await res.blob(), { imageOrientation: 'from-image' })
  const size = [bitmap.width, bitmap.height]
  const scale = detectionScale(bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return { image: canvas, size, scale }
}

const defaultLoadTesseract = () => import('tesseract.js')

/**
 * @param {{ pageId?: string|null, imageUrl?: string|null,
 *   loadImage?: (url: string, o: { signal?: AbortSignal }) => Promise<{ image: any, size: [number, number], scale: number }>,
 *   loadTesseract?: () => Promise<any> }} opts  loadImage/loadTesseract — להזרקה בטסטים
 */
export function useLocalWordBoxes({ pageId, imageUrl, canSave = true, loadImage = defaultLoadImage, loadTesseract = defaultLoadTesseract } = {}) {
  const initial = (id) => ({ status: id ? 'checking' : 'idle', progress: 0, source: null, error: null, notice: null })
  const [state, setState] = useState(() => initial(pageId))
  // מעבר עמוד: איפוס המצב בזמן הרינדור (לא ב-effect) — הדפוס שמומלץ ב-React לאיפוס לפי prop
  const [stateFor, setStateFor] = useState(pageId)
  if (stateFor !== pageId) {
    setStateFor(pageId)
    setState(initial(pageId))
  }
  // גרסת הפריסה בשרת, יחד עם העמוד שאליו היא שייכת — תשובת שמירה של עמוד קודם שמגיעה אחרי
  // מעבר עמוד לא תדרוס את גרסת העמוד החדש (אחרת השמירה הבאה נכשלת ב-409 שווא)
  const versionRef = useRef(/** @type {{ pageId: any, version: number }} */ ({ pageId: null, version: 0 }))
  const imageShaRef = useRef(/** @type {string|null} */ (null)) // hash התמונה שעליה חושבו התיבות (מה-GET)
  const runRef = useRef(0) // מונה ריצות — תוצאה של עמוד קודם לא תדרוס את הנוכחי
  const localOnlyRef = useRef(/** @type {object|null} */ (null)) // זיהוי שנשמר רק מקומית (עמוד לא נתפס)
  const workerRef = useRef(/** @type {any} */ (null)) // worker של tesseract שרץ עכשיו (לעצירה)

  // עצירת זיהוי שרץ: יציאה מהעורך / מעבר עמוד / זיהוי חדש — ה-worker (WASM כבד) לא ממשיך ברקע
  const stopWorker = useCallback(() => {
    const w = workerRef.current
    workerRef.current = null
    if (w) Promise.resolve().then(() => w.terminate()).catch(() => {})
  }, [])
  useEffect(() => () => {
    runRef.current++
    stopWorker()
  }, [stopWorker])

  useEffect(() => {
    const run = ++runRef.current
    stopWorker()
    versionRef.current = { pageId, version: 0 }
    imageShaRef.current = null
    localOnlyRef.current = null
    if (!pageId) return undefined
    // אין פריסה בשרת — אולי זוהה כאן קודם בלי שמירה (עמוד שלא נתפס): מהמטמון של הלשונית
    const localOr = (fallback) => {
      const stored = readLocalWords(pageId, imageUrl)
      const src = stored ? storedToTrack(stored) : null
      if (!src || src.level === 'off') return fallback
      localOnlyRef.current = stored
      return { status: 'ready', progress: 0, source: src, error: null, notice: LOCAL_ONLY_NOTICE }
    }
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`${API}?pageId=${encodeURIComponent(pageId)}`, { signal: ctrl.signal, cache: 'no-store' })
        const body = await res.json().catch(() => null)
        if (run !== runRef.current) return
        if (!res.ok || !body?.success) {
          setState(localOr({ status: 'none', progress: 0, source: null, error: body?.error || MSG.load, notice: null }))
          return
        }
        versionRef.current = { pageId, version: body.data?.version ?? 0 }
        imageShaRef.current = typeof body.data?.image?.sha256 === 'string' ? body.data.image.sha256 : null
        const src = body.data?.layout ? storedToTrack(body.data.layout) : null
        setState(src && src.level !== 'off'
          ? { status: 'ready', progress: 0, source: src, error: null, notice: null }
          : localOr({ status: 'none', progress: 0, source: null, error: null, notice: null }))
      } catch (e) {
        if (e?.name === 'AbortError' || run !== runRef.current) return
        setState(localOr({ status: 'none', progress: 0, source: null, error: MSG.load, notice: null }))
      }
    })()
    return () => ctrl.abort()
  }, [pageId, imageUrl, stopWorker])

  // שמירה בשרת: null = הצליח, אחרת הודעת השגיאה
  const putLayout = useCallback(async (payload) => {
    try {
      const res = await fetch(API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // ה-hash של התמונה שהזיהוי רץ עליה — אם הוחלפה בינתיים, השרת דוחה ב-409
        body: JSON.stringify({ pageId, expectedVersion: versionFor(versionRef.current, pageId), ...(imageShaRef.current ? { imageSha256: imageShaRef.current } : {}), ...payload }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.success) {
        versionRef.current = nextVersionRecord(versionRef.current, pageId, body.data?.version)
        return null
      }
      if (res.status === 409) return body?.code === 'image-changed' ? MSG.imageChanged : MSG.conflict
      return body?.error || MSG.save
    } catch {
      return MSG.save
    }
  }, [pageId])

  // העמוד נתפס אחרי זיהוי מקומי — עכשיו אפשר לשמור בשרת
  useEffect(() => {
    const payload = localOnlyRef.current
    if (!canSave || !payload || !pageId) return
    localOnlyRef.current = null
    let alive = true
    ;(async () => {
      const error = await putLayout(payload)
      if (!error) writeLocalWords(pageId, imageUrl, null)
      else localOnlyRef.current = payload
      if (alive) setState((s) => ({ ...s, notice: null, error }))
    })()
    return () => { alive = false }
  }, [canSave, pageId, imageUrl, putLayout, state.source])

  const detect = useCallback(async () => {
    if (!pageId || !imageUrl) return null
    const run = ++runRef.current
    stopWorker()
    const live = () => run === runRef.current
    const patch = (p) => live() && setState((s) => ({ ...s, ...p }))
    patch({ status: 'detecting', progress: 0, error: null, notice: null })

    // בעמוד בלי layout ה-GET הרגיל אינו קורא ומגבב את קובץ המלא. רק עכשיו, כשהמשתמש
    // ביקש זיהוי, קבע snapshot של התמונה. אם משתמש אחר שמר layout בינתיים, השתמש בו
    // במקום להריץ OCR כבד ולהיכשל אחר כך ב-409.
    // אם GET קודם כבר החזיר hash (למשל layout קיים שנמצא stale), אין צורך לגבב שוב.
    if (!imageShaRef.current) {
      try {
        const res = await fetch(`${API}?pageId=${encodeURIComponent(pageId)}&inspectImage=1`, { cache: 'no-store' })
        const body = await res.json().catch(() => null)
        if (!live()) return null
        if (!res.ok || !body?.success) {
          patch({ status: 'none', progress: 0, error: body?.error || MSG.load })
          return null
        }
        versionRef.current = { pageId, version: body.data?.version ?? 0 }
        imageShaRef.current = typeof body.data?.image?.sha256 === 'string' ? body.data.image.sha256 : null
        const existing = body.data?.layout ? storedToTrack(body.data.layout) : null
        if (existing && existing.level !== 'off') {
          patch({ status: 'ready', progress: 0, source: existing, error: null, notice: null })
          return existing
        }
      } catch {
        if (!live()) return null
        patch({ status: 'none', progress: 0, error: MSG.load })
        return null
      }
    }

    let loaded
    try {
      loaded = await loadImage(imageUrl, {})
    } catch {
      patch({ status: 'none', progress: 0, error: MSG.image })
      return null
    }

    let result
    let worker
    try {
      const mod = await loadTesseract()
      const T = mod?.createWorker ? mod : mod?.default
      const urls = tesseractAssetUrls(tesseractPkg.version, window.location.origin)
      worker = await T.createWorker('heb', T.OEM?.LSTM_ONLY ?? 1, {
        ...urls,
        workerBlobURL: false,
        logger: (m) => {
          if (m?.status === 'recognizing text' && Number.isFinite(m.progress)) patch({ progress: Math.max(0, Math.min(1, m.progress)) })
        },
      })
      workerRef.current = worker
      if (!live()) return null // בוטל בזמן הטעינה (finally עוצר את ה-worker)
      await worker.setParameters({ tessedit_pageseg_mode: T.PSM?.AUTO ?? '3', preserve_interword_spaces: '1' })
      result = await worker.recognize(loaded.image, {}, { blocks: true, text: false })
    } catch (e) {
      const msg = String(e?.message || e)
      patch({ status: 'none', progress: 0, error: /traineddata/i.test(msg) ? MSG.lang : MSG.detect })
      return null
    } finally {
      if (worker) {
        if (workerRef.current === worker) workerRef.current = null
        Promise.resolve().then(() => worker.terminate()).catch(() => {})
      }
    }
    if (!live()) return null

    // tesseract מחזיר את כל השורות בזרם אחד — בעמוד דו-טורי מחלקים לימין ולשמאל לפי המיקום
    const track = splitColumnStreams(fromTesseract(result, { size: loaded.size, scale: loaded.scale }))
    const payload = track.level === 'word' ? trackToStored(track) : null
    if (!payload) {
      patch({ status: 'none', progress: 0, error: MSG.empty })
      return null
    }
    if (!canSave) {
      // עמוד שלא נתפס — השרת היה דוחה (403): נשאר בזיכרון ובמטמון הלשונית בלבד
      localOnlyRef.current = payload
      writeLocalWords(pageId, imageUrl, payload)
      patch({ status: 'ready', progress: 0, source: track, error: null, notice: LOCAL_ONLY_NOTICE })
      return track
    }
    patch({ status: 'saving', progress: 1, source: track })
    localOnlyRef.current = null
    const error = await putLayout(payload)
    if (!error) writeLocalWords(pageId, imageUrl, null)
    patch({ status: 'ready', progress: 0, source: track, error })
    return track
  }, [pageId, imageUrl, canSave, loadImage, loadTesseract, stopWorker, putLayout])

  return { ...state, detect }
}
