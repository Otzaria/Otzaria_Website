// דף תוצאות החיפוש בחנות התוספים — Server Component: השאילתה (?q=) ועמוד
// התוצאות הראשון מחושבים בשרת (אותה לוגיקה בדיוק כמו /api/plugins/search,
// דרך src/lib/pluginSearchResults.js), כך שהתוצאות מופיעות ב-HTML הראשוני
// ולא אחרי JS → fetch. ההקלדה, ה-debounce ו"טען עוד" נשארים בצד הלקוח
// (PluginSearchClient) ומשתמשים ב-API כמו קודם.
//
// הגבלת הקצב של ה-API חלה גם כאן, על אותו bucket ('plugin-search', דרך
// checkSharedRateLimit — המאגר הרגיל של checkRateLimit נפרד לכל bundle): טעינת
// דף עם ?q= צורכת אסימון אחד במקום בקשת ה-API הראשונה שנחסכה. כשהמגבלה
// נחצתה (או בשגיאה) initialResults=null והלקוח שולח את החיפוש בעצמו, כמו קודם.
import { headers } from 'next/headers'
import dbConnect from '@/lib/db'
import { checkSharedRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/client-ip'
import { runPluginSearch, MAX_PLUGIN_SEARCH_QUERY_LENGTH } from '@/lib/pluginSearchResults'
import { toPluginCardData } from '@/lib/pluginCardData'
import PluginSearchClient from './PluginSearchClient'
import { SEARCH_PAGE_SIZE, type PluginSearchResponse } from './searchConfig'

async function loadInitialResults(rawQuery: string): Promise<PluginSearchResponse | null> {
  const query = rawQuery.trim().slice(0, MAX_PLUGIN_SEARCH_QUERY_LENGTH)
  if (!query) return null
  try {
    const ip = getClientIp({ headers: await headers() })
    if (!checkSharedRateLimit(ip, 'plugin-search', 60, 'minute')) return null

    await dbConnect()
    const body = await runPluginSearch({ query, limit: SEARCH_PAGE_SIZE, offset: 0 })
    // רק מה ששורת התוצאה מציגה (שדות הכרטיס + קטגוריות/ציון) — ה-props נשלחים
    // לדפדפן פעמיים (HTML ו-payload); "טען עוד" ממשיך לקבל מה-API את הייצוג המלא.
    const slim = {
      ...body,
      results: body.results.map((result: { categories: unknown; score: number; matchedFields: string[] }) => ({
        ...toPluginCardData(result),
        categories: result.categories,
        score: result.score,
        matchedFields: result.matchedFields
      }))
    }
    // סבב JSON — אותו מבנה שהלקוח קיבל מה-API (תאריכים כמחרוזות וכו')
    return JSON.parse(JSON.stringify(slim)) as PluginSearchResponse
  } catch (error) {
    console.error('Error rendering plugin search:', error)
    return null
  }
}

export default async function PluginSearchPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { q } = await searchParams
  // כמו useSearchParams().get('q'): הערך הראשון כשהפרמטר חוזר
  const initialQuery = (Array.isArray(q) ? q[0] : q) || ''
  const initialResults = await loadInitialResults(initialQuery)
  return <PluginSearchClient key={initialQuery} initialQuery={initialQuery} initialResults={initialResults} />
}
