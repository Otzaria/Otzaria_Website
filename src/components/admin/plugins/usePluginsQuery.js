'use client'

import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { parsePluginsQuery, serializePluginsQuery } from '@/lib/adminPlugins/pluginsQuery'

/**
 * התצוגה, הסינון והמגירה — מהכתובת ואליה (כמו במסך ההעלאות): history.replaceState / pushState, ו-Next
 * מסנכרן את useSearchParams בלי לבקש את העמוד מהשרת. push — עמוד ברשימה ופתיחת מגירה (כדי ש"אחורה"
 * יחזיר / יסגור); סינון — replace, בלי לנפח את ההיסטוריה.
 */
export function usePluginsQuery() {
  return useUrlQuery(parsePluginsQuery, serializePluginsQuery)
}
