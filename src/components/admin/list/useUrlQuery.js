'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { stateForUrlReplace } from '@/lib/historyState'

/**
 * מצב של מסך ניהול (סינון, מיון, עמוד, מגירה…) — מהכתובת ואליה. משותף לכל מסכי הרשימות (ספרים, עמודים, תוספים,
 * הצעות, העלאות, משתמשים — כל אחד עם parse / serialize משלו).
 *
 * הכתיבה — history.replaceState / pushState, ו-Next מסנכרן את useSearchParams בלי לבקש את העמוד מהשרת.
 * push — מה ש"אחורה" צריך להחזיר (עמוד ברשימה, פתיחת מגירה); אחרת (סינון) — replace, בלי לנפח את ההיסטוריה.
 *
 * @template Q
 * @param {(params: URLSearchParams) => Q} parse   יציבה (פונקציה של מודול)
 * @param {(query: Q) => string} serialize          יציבה; מחזירה "?a=1" או ""
 * @returns {[Q, (next: Q, options?: { push?: boolean }) => void]}
 */
export function useUrlQuery(parse, serialize) {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const query = useMemo(() => parse(searchParams), [parse, searchParams])
  const setQuery = useCallback((next, { push = false } = {}) => {
    const url = `${pathname}${serialize(next)}`
    if (push) window.history.pushState(null, '', url)
    // ה-state נשמר (ההגנה על שינויים שלא נשמרו — useUnsavedChangesGuard — מסמנת בו את הרשומה הכפולה), אבל בלי
    // הסימונים של Next (__NA): איתם Next מתעלם מהקריאה, useSearchParams לא מתעדכן והסינון לא חל (lib/historyState)
    else window.history.replaceState(stateForUrlReplace(window.history.state), '', url)
  }, [pathname, serialize])
  return [query, setQuery]
}
