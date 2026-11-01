import { useRef, useCallback, useState, useEffect } from 'react'
import { apiPost } from '@/lib/api-utils'
import { byteLength, chooseLeaveRoute, likelyTooLargeToSendOnLeave } from './leaveSendRoute'

const DEBOUNCE_MS = 2000 // שמירה אחרי 2 שניות ללא הקלדה
const SAVE_URL = '/api/page-content'

// הודעה כשעוזבים את העמוד והשמירה האחרונה נכשלה (רוב הדפדפנים מציגים טקסט כללי משלהם)
export const UNSAVED_LEAVE_MESSAGE = 'השינויים האחרונים לא נשמרו. לצאת בכל זאת?'

// גוף הבקשה ל-/api/page-content — אותו מבנה בשמירה רגילה ובשליחה ביציאה מהדף
export function toSaveBody(data) {
  const body = {
    bookPath: data.bookPath,
    pageNumber: data.pageNumber,
    content: data.content,
    leftColumn: data.leftColumn,
    rightColumn: data.rightColumn,
    twoColumns: data.twoColumns,
    isContentSplit: data.isContentSplit,
    rightColumnName: data.rightColumnName,
    leftColumnName: data.leftColumnName
  }
  // לקוחות ישנים אינם שולחים revision; לא מוסיפים undefined לגוף.
  if (Number.isSafeInteger(data.saveRevision) && data.saveRevision > 0) body.saveRevision = data.saveRevision
  return body
}

const leaveBody = (data) => JSON.stringify(toSaveBody(data))

// שליחה שממשיכה גם אחרי שהדף נסגר (pagehide). דפדפנים מגבילים גוף keepalive ל-64KB, ובגוף גדול
// fetch לא נכשלת מיד אלא נדחית אחר כך — לכן מודדים את הגוף מראש (leaveSendRoute.js): קטן — fetch
// עם keepalive; גדול — sendBeacon (POST, כמו השמירה הרגילה; השרת קורא request.json() בלי תלות
// ב-Content-Type). אם sendBeacon לא קיבלה — fetch רגיל כניסיון אחרון (ייתכן שייקטע), ומחזירים false.
export function sendOnLeave(data) {
  const body = leaveBody(data)
  if (chooseLeaveRoute(byteLength(body)) === 'keepalive') {
    try {
      fetch(SAVE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
        .catch(() => {})
      return true
    } catch {
      // keepalive נדחה סינכרונית — ממשיכים ל-sendBeacon
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(SAVE_URL, new Blob([body], { type: 'application/json' }))) return true
  } catch {
    // ממשיכים לניסיון האחרון
  }
  try {
    fetch(SAVE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {})
  } catch {
    // אין עוד מה לנסות
  }
  return false
}

// שמירה אוטומטית של תוכן עמוד ל-/api/page-content.
//
// save(data)    — שמירה מושהית (debounce): כל קריאה דוחה את הקודמת.
// saveNow(data) — שמירה מיידית (Ctrl+S, לפני סיום עמוד). בלי data — שומר את מה שממתין (או, אם
//                 אין, מנסה שוב את השמירה האחרונה שנכשלה).
// flush()       — מריץ מיד שמירה שממתינה ומחכה גם לשמירה שכבר בדרך. מחזיר true אם השמירה
//                 האחרונה הצליחה.
//
// השמירות יוצאות בטור (כל שמירה מחכה לקודמת), כדי שתשובה איטית לא תדרוס גרסה חדשה יותר.
//
// יציאה מהעורך לא מאבדת טקסט: ב-unmount (ניווט פנימי, כפתור "אחורה") שמירה שממתינה נשלחת מיד
// במקום להתבטל; ב-pagehide (סגירת לשונית, רענון, ניווט חיצוני) נשלח מה שממתין/בדרך/נכשל עם
// keepalive; ו-beforeunload מבקש אישור רק כשהשמירה האחרונה נכשלה ואין מה לשלוח במקומה.
export function useAutoSave() {
  const timeoutRef = useRef(null)
  const pendingRef = useRef(null)
  const failedRef = useRef(null) // הנתונים של השמירה האחרונה שנכשלה (עד שמירה מוצלחת אחריה)
  const latestRef = useRef(null) // הגרסה העדכנית שטרם אושרה, גם כשהיא בתור מאחורי בקשה אחרת
  const queuedRef = useRef(null) // השמירה האחרונה שהוכנסה לתור, לפני שהבקשה התחילה
  const chainRef = useRef(Promise.resolve(true))
  // milliseconds * 1000 משאיר 999 שינויים באותה millisecond ונשאר בטווח Number הבטוח.
  // Math.max מבטיח מונוטוניות גם אם שעון המערכת זז לאחור.
  // מאותחל רק באירוע השמירה הראשון; Date.now בזמן render מפר את טוהר ה-hook.
  const revisionRef = useRef(0)
  // סטטוסים אפשריים: 'saved', 'unsaved', 'saving', 'error'
  const [status, setStatus] = useState('saved')

  const clearTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const snapshot = useCallback((data) => {
    const existing = Number.isSafeInteger(data?.saveRevision) && data.saveRevision > 0
      ? data.saveRevision
      : Math.max(revisionRef.current + 1, Date.now() * 1000)
    revisionRef.current = Math.max(revisionRef.current, existing)
    return { ...toSaveBody(data), saveRevision: existing }
  }, [])

  const saveContent = useCallback((data) => {
    queuedRef.current = data
    const run = async () => {
      setStatus('saving')
      try {
        await apiPost(SAVE_URL, toSaveBody(data))
        // השמירות בטור — הצלחה כאן מחליפה כל כישלון קודם (התוכן הזה חדש ממנו)
        if (latestRef.current === data) {
          latestRef.current = null
          failedRef.current = null
        }
        // אם בינתיים הגיע שינוי חדש — הוא עדיין לא נשמר
        setStatus(latestRef.current ? (pendingRef.current ? 'unsaved' : 'saving') : 'saved')
        return true
      } catch (error) {
        console.error('Auto-save error:', error)
        if (latestRef.current === data) {
          failedRef.current = data
          setStatus('error')
        }
        return false
      } finally {
        if (queuedRef.current === data) queuedRef.current = null
      }
    }
    const next = chainRef.current.then(run, run)
    chainRef.current = next
    return next
  }, [])

  // יציאה מהדף (סגירה/רענון/ניווט חיצוני): שולחים את הגרסה העדכנית ביותר שעוד לא אושרה
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const latestUnconfirmed = () => latestRef.current
    const onPageHide = () => {
      const data = latestUnconfirmed()
      if (!data) return
      clearTimer()
      pendingRef.current = null
      if (!sendOnLeave(data)) {
        // לא נשלח — אם הדף חוזר מ-bfcache, נשמר ככישלון כדי ש-flush/beforeunload יטפלו בו
        failedRef.current = data
        setStatus('error')
      }
    }
    const onBeforeUnload = (e) => {
      // יש מה לשלוח (ממתין/בדרך) — pagehide ישלח אותו, לא מטרידים את המשתמש; אלא אם הוא גדול
      // ממגבלת sendBeacon ולכן כמעט בוודאות לא יישלח. כשהשמירה האחרונה נכשלה ואין גרסה חדשה
      // בדרך — מבקשים אישור.
      const toSend = latestRef.current === failedRef.current ? null : latestRef.current
      if (toSend) {
        if (!likelyTooLargeToSendOnLeave(byteLength(leaveBody(toSend)))) return
      } else if (!failedRef.current) return
      e.preventDefault()
      e.returnValue = UNSAVED_LEAVE_MESSAGE
      return UNSAVED_LEAVE_MESSAGE
    }
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  // unmount (חזרה לספר, ניווט פנימי): שמירה שממתינה ל-debounce נשלחת מיד — לא מתבטלת
  useEffect(() => () => {
    clearTimer()
    const pending = pendingRef.current
    pendingRef.current = null
    if (pending) saveContent(pending)
  }, [saveContent])

  const debouncedSave = useCallback((data) => {
    data = snapshot(data)
    // עדכון מיידי שהתוכן לא שמור
    setStatus('unsaved')
    latestRef.current = data
    failedRef.current = null
    pendingRef.current = data
    clearTimer()
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      const pending = pendingRef.current
      pendingRef.current = null
      if (pending) saveContent(pending)
    }, DEBOUNCE_MS)
  }, [saveContent, snapshot])

  const saveNow = useCallback(async (data) => {
    clearTimer()
    const toSave = data != null ? snapshot(data) : pendingRef.current ?? (latestRef.current === queuedRef.current ? null : latestRef.current)
    pendingRef.current = null
    if (!toSave) return chainRef.current
    latestRef.current = toSave
    failedRef.current = null
    return saveContent(toSave)
  }, [saveContent, snapshot])

  const flush = useCallback(() => saveNow(), [saveNow])

  // מחזירים אובייקט במקום רק פונקציה
  return { save: debouncedSave, saveNow, flush, status }
}
