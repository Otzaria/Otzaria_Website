'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchBookStatuses, fetchTrash, fetchUploads } from './uploadsApi'

/**
 * אירוע בחלון: ההעלאות השתנו בשרת ממקום אחר — "בטל" מהודעה שנשארה ממסך קודם (ההודעות במעטפת,
 * ושורדות מעבר בין לשוניות). המסך הפתוח טוען את הרשימה מחדש, בשקט (בלי שלד).
 */
export const UPLOADS_CHANGED_EVENT = 'admin-uploads:changed'

export function announceUploadsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UPLOADS_CHANGED_EVENT))
}

/**
 * הנתונים של המסך: ההעלאות (או האשפה), מצב הטעינה, והגדרות המצבים.
 * העלאות — מגיעות מוכנות מהשרת (initialItems); אם הטעינה בשרת נכשלה (initialError) — שגיאה
 * בתוך הדף ו"נסה שוב". אשפה — נטענת כאן (כמו קודם), עם שלד בזמן הטעינה.
 * הגדרות המצבים — מהשרת; אם לא הגיעו, נטענות כאן (עד אז — שמות ברירת המחדל).
 *
 * retry — טעינה מחדש עם שלד; refresh — טעינה מחדש בשקט (הרשימה נשארת עד שהחדשה מגיעה).
 * status: loading / ready / error; sessionExpired — הכשל הוא התחברות שפגה (מציגים "התחבר").
 */
export function useUploadsData({ tab, initialItems, initialError, initialStatuses }) {
  const isTrash = tab === 'trash'
  const [items, setItems] = useState(() => (isTrash || initialError ? [] : initialItems || []))
  const [status, setStatus] = useState(() => (isTrash ? 'loading' : initialError ? 'error' : 'ready'))
  const [error, setError] = useState(() => ({ message: initialError ? 'השרת לא החזיר את הרשימה. נסה שוב בעוד רגע.' : '', sessionExpired: false }))
  const [statuses, setStatuses] = useState(initialStatuses || null)

  const fail = useCallback((e) => {
    setError({ message: e?.message || 'השרת לא החזיר את הרשימה. נסה שוב בעוד רגע.', sessionExpired: Boolean(e?.sessionExpired) })
    setStatus('error')
  }, [])

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus('loading')
    try {
      const list = await (isTrash ? fetchTrash() : fetchUploads())
      setItems(list)
      setStatus('ready')
    } catch (e) {
      // רענון שקט שנכשל — הרשימה הקיימת נשארת (ההודעה על הפעולה כבר הוצגה)
      if (!silent) fail(e)
    }
  }, [isTrash, fail])

  useEffect(() => {
    if (!isTrash) return undefined
    let cancelled = false
    fetchTrash()
      .then((list) => { if (!cancelled) { setItems(list); setStatus('ready') } })
      .catch((e) => { if (!cancelled) fail(e) })
    return () => { cancelled = true }
  }, [isTrash, fail])

  useEffect(() => {
    if (initialStatuses || isTrash) return undefined
    let cancelled = false
    fetchBookStatuses().then((s) => { if (!cancelled && s) setStatuses(s) }).catch(() => {})
    return () => { cancelled = true }
  }, [initialStatuses, isTrash])

  useEffect(() => {
    const onChanged = () => load({ silent: true })
    window.addEventListener(UPLOADS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(UPLOADS_CHANGED_EVENT, onChanged)
  }, [load])

  const retry = useCallback(() => load(), [load])
  const refresh = useCallback(() => load({ silent: true }), [load])

  return { items, setItems, status, error, retry, refresh, statuses, setStatuses }
}
