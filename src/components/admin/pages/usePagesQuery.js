'use client'

import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { parsePagesQuery, serializePagesQuery } from '@/lib/adminPagesScreen/pagesQuery'

/**
 * הסינון, המיון והעמוד — מהכתובת ואליה (כמו במשתמשים): history.replaceState / pushState, ו-Next מסנכרן את
 * useSearchParams בלי לבקש את העמוד מהשרת. push — מעבר עמוד ברשימה (כדי ש"אחורה" יחזיר); סינון — replace.
 */
export function usePagesQuery() {
  return useUrlQuery(parsePagesQuery, serializePagesQuery)
}
