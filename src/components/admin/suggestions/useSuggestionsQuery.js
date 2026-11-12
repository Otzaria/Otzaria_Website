'use client'

import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { parseSuggestionsQuery, serializeSuggestionsQuery } from '@/lib/adminSuggestions/suggestionsQuery'

/**
 * הסינון, המיון והעמוד — מהכתובת ואליה (כמו בתוספים): history.replaceState / pushState, ו-Next מסנכרן את
 * useSearchParams בלי לבקש את העמוד מהשרת. push — מעבר עמוד (כדי ש"אחורה" יחזיר); סינון — replace.
 */
export function useSuggestionsQuery() {
  return useUrlQuery(parseSuggestionsQuery, serializeSuggestionsQuery)
}
