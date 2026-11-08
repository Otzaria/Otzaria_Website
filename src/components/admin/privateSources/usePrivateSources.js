'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestJson } from '@/components/admin/list/adminRequest'
import { computeSourceStats } from './sourcesFilters'

const SOURCES_URL = '/api/admin/private-sources'
const CONFIG_URL = '/api/admin/private-sources/config'
const EMPTY_OPTIONS = { statuses: {}, methods: {}, platforms: {} }

/** POST עם גוף JSON (כמו קודם). requestJson: התחברות שפגה / שבת / תשובה שאינה JSON — שגיאה בעברית */
async function postJson(url, body, fallback) {
  const data = await requestJson(url, { method: 'POST', body, fallback })
  if (!data.success) throw new Error(fallback)
  return data
}

const GITHUB_WARNING = 'לא הצלחנו לטעון את רשימת הספרים מ-GitHub כרגע — מוצגות רק רשומות שמורות.'

/**
 * הנתונים והפעולות של לשונית "מקורות" ושל רשימות המקורות בלשונית "הגדרות" — אותן בקשות כמו קודם:
 *   GET  /api/admin/private-sources[?refresh=1]       (refresh — סנכרון עם GitHub)
 *   POST /api/admin/private-sources {payload}          (שמירת רשומה)
 *   DELETE /api/admin/private-sources?path=…          (מחיקת רשומה)
 *   POST /api/admin/private-sources/config {key,value} (רשימה / סטים ידניים)
 * הפעולות מחזירות true בהצלחה; שגיאה — זורקות (המסך מציג אותה), כדי שחלון העריכה יישאר פתוח.
 * הבקשות דרך requestJson / send (admin/list/adminRequest): הפניה לדף ההתחברות = "פג תוקף" (error.sessionExpired).
 * error — AdminApiError (message, status, sessionExpired) או null.
 * סנכרון (load({refresh:true})): syncing בזמן הריצה; בכישלון כשיש כבר רשימה — הרשימה, השגיאה והאזהרה הקודמות
 * נשארים, והשגיאה חוזרת למסך (טוסט). load מחזיר { ok, error }.
 */
export default function usePrivateSources() {
  const [items, setItems] = useState([])
  const [orphans, setOrphans] = useState([])
  const [manualSets, setManualSets] = useState({})
  const [allBooks, setAllBooks] = useState([])
  const [options, setOptions] = useState(EMPTY_OPTIONS)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [githubWarning, setGithubWarning] = useState('')
  const hasItems = useRef(false)

  // quiet — טעינה מחדש בלי להחליף את הרשימה בשלד (למשל אחרי שמירת סטים); refresh — סנכרון עם GitHub
  const load = useCallback(async ({ refresh = false, quiet = false } = {}) => {
    if (refresh) setSyncing(true)
    if (refresh || quiet) setRefreshing(true)
    else setLoading(true)
    if (!refresh) setError(null)
    try {
      const data = await requestJson(`${SOURCES_URL}${refresh ? '?refresh=1' : ''}`, { cache: 'no-store', fallback: refresh ? 'הסנכרון עם GitHub נכשל. נסה שוב.' : 'לא הצלחנו לטעון את המקורות.' })
      if (!data.success) throw new Error(refresh ? 'הסנכרון עם GitHub נכשל. נסה שוב.' : 'לא הצלחנו לטעון את המקורות.')
      setItems(data.items || [])
      setOrphans(data.orphans || [])
      setManualSets(data.manualSets || {})
      setAllBooks(data.books || [])
      setOptions(data.options || EMPTY_OPTIONS)
      hasItems.current = (data.items || []).length > 0
      setError(null)
      setGithubWarning(data.githubError ? data.githubErrorMessage || GITHUB_WARNING : '')
      return { ok: true, error: null }
    } catch (loadError) {
      // סנכרון שנכשל כשכבר יש רשימה — הרשימה (והאזהרה הקודמת) נשארות; ההודעה — בטוסט אצל המסך
      if (!(refresh && hasItems.current)) setError(loadError)
      return { ok: false, error: loadError }
    } finally {
      setLoading(false)
      setRefreshing(false)
      if (refresh) setSyncing(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה ראשונה מהשרת
    load()
  }, [load])

  const saveSource = useCallback(async (payload) => {
    const data = await postJson(SOURCES_URL, payload, 'לא הצלחנו לשמור את פרטי המקור.')
    // רשומה של חבר בתוך סט אינה פריט עליון — צריך טעינה מחדש (שקטה) כדי לרענן אותה
    if (items.some((item) => item.bookPath === payload.bookPath)) {
      setItems((prev) => prev.map((item) => (item.bookPath === payload.bookPath ? { ...item, record: data.record } : item)))
    } else {
      await load({ quiet: true })
    }
    return true
  }, [items, load])

  const deleteSource = useCallback(async (item) => {
    const data = await requestJson(`${SOURCES_URL}?path=${encodeURIComponent(item.bookPath)}`, { method: 'DELETE', fallback: 'לא הצלחנו למחוק את הרשומה.' })
    if (!data.success) throw new Error('לא הצלחנו למחוק את הרשומה.')
    const isTopLevel = items.some((row) => row.bookPath === item.bookPath)
    if (isTopLevel) setItems((prev) => prev.map((row) => (row.bookPath === item.bookPath ? { ...row, record: null } : row)))
    setOrphans((prev) => prev.filter((row) => row.bookPath !== item.bookPath))
    if (!isTopLevel) await load({ quiet: true })
    return true
  }, [items, load])

  /** רשימה (statuses / methods / platforms) — הערך החדש מהשרת נכנס לאפשרויות */
  const saveOptionList = useCallback(async (listId, configKey, value) => {
    const data = await postJson(CONFIG_URL, { key: configKey, value }, 'לא הצלחנו לשמור את ההגדרות.')
    setOptions((prev) => ({ ...prev, [listId]: data.value }))
    return true
  }, [])

  /** סטים ידניים — הקיבוץ מחושב בשרת, ולכן טעינה שקטה מחדש (בלי סנכרון GitHub) */
  const saveManualSets = useCallback(async (configKey, value) => {
    await postJson(CONFIG_URL, { key: configKey, value }, 'לא הצלחנו לשמור את הסטים.')
    await load({ quiet: true })
    return true
  }, [load])

  const stats = useMemo(() => computeSourceStats(items), [items])

  return {
    items, orphans, manualSets, allBooks, options, loading, refreshing, syncing, error, githubWarning, stats,
    load, saveSource, deleteSource, saveOptionList, saveManualSets,
  }
}
