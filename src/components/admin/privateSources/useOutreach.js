'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { findDuplicates } from '@/lib/institute-outreach'
import { AdminApiError, errorMessage, requestJson, send, serverError } from '@/components/admin/list/adminRequest'
import { computeOutreachStats } from './outreachFilters'

const OUTREACH_URL = '/api/admin/institute-outreach'
const CONFIG_URL = '/api/admin/private-sources/config'

/**
 * הנתונים והפעולות של לשונית "פניות למכונים" ושל "מצבי פניות" בהגדרות — אותן בקשות כמו קודם:
 *   GET /api/admin/institute-outreach · POST {payload} (409 + duplicate — מוחזר לחלון, לא שגיאה) ·
 *   DELETE ?id=… · POST /api/admin/private-sources/config { key, value } (מצבי הפניות).
 * שגיאות נזרקות (המסך מציג אותן). הבקשות דרך requestJson / send (admin/list/adminRequest): הפניה לדף ההתחברות
 * = "פג תוקף" (error.sessionExpired), שבת ושגיאה באנגלית — בעברית. error — AdminApiError או null.
 */
export default function useOutreach() {
  const [items, setItems] = useState([])
  const [statuses, setStatuses] = useState({})
  const [channels, setChannels] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await requestJson(OUTREACH_URL, { cache: 'no-store', fallback: 'לא הצלחנו לטעון את הפניות.' })
      if (!data.success) throw new Error('לא הצלחנו לטעון את הפניות.')
      setItems(data.items || [])
      setStatuses(data.statuses || {})
      setChannels(data.channels || {})
    } catch (loadError) {
      setError(loadError)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה ראשונה מהשרת
    load()
  }, [load])

  // לכל פנייה — הפניות האחרות לאותו נמען (בסיס לסימון הכפילויות)
  const duplicatesById = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      const matches = findDuplicates(items, item, item._id)
      if (matches.length) map.set(item._id, matches)
    }
    return map
  }, [items])

  const stats = useMemo(() => computeOutreachStats(items, duplicatesById), [items, duplicatesById])

  /** שמירה. 409 עם duplicate — התשובה חוזרת לחלון (שיציג את הכפילות ויבקש אישור נוסף) */
  const save = useCallback(async (payload) => {
    // send ולא requestJson: 409 עם duplicate אינו שגיאה
    const response = await send(OUTREACH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const isJson = (response.headers?.get?.('content-type') || '').includes('application/json')
    const data = isJson ? await response.json().catch(() => null) : null
    if (response.status === 409 && data?.duplicate) return data
    if (!response.ok || !data?.success) {
      throw new AdminApiError(errorMessage(response.status, 'לא הצלחנו לשמור את הפנייה.', serverError(data)), response.status)
    }
    setItems((prev) => (prev.some((item) => item._id === data.record._id)
      ? prev.map((item) => (item._id === data.record._id ? data.record : item))
      : [data.record, ...prev]))
    return data
  }, [])

  const remove = useCallback(async (item) => {
    const data = await requestJson(`${OUTREACH_URL}?id=${encodeURIComponent(item._id)}`, { method: 'DELETE', fallback: 'לא הצלחנו למחוק את הפנייה.' })
    if (!data.success) throw new Error('לא הצלחנו למחוק את הפנייה.')
    setItems((prev) => prev.filter((row) => row._id !== item._id))
    return true
  }, [])

  const saveStatuses = useCallback(async (configKey, value) => {
    const data = await requestJson(CONFIG_URL, { method: 'POST', body: { key: configKey, value }, fallback: 'לא הצלחנו לשמור את ההגדרות.' })
    if (!data.success) throw new Error('לא הצלחנו לשמור את ההגדרות.')
    setStatuses(data.value)
    return true
  }, [])

  return { items, statuses, channels, loading, error, duplicatesById, stats, load, save, remove, saveStatuses }
}
