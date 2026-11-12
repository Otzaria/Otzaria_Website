'use client'

import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { parseUsersQuery, serializeUsersQuery } from '@/lib/adminUsersScreen/usersQuery'

/**
 * החיפוש, הסינון, המיון, העמוד והמגירה — מהכתובת ואליה (כמו בתוספים): history.replaceState / pushState, ו-Next
 * מסנכרן את useSearchParams בלי לבקש את העמוד מהשרת. push — עמוד ברשימה ופתיחת מגירה (כדי ש"אחורה" יחזיר /
 * יסגור); סינון — replace, בלי לנפח את ההיסטוריה.
 */
export function useUsersQuery() {
  return useUrlQuery(parseUsersQuery, serializeUsersQuery)
}
