'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { SENTINEL } from '@/hooks/useUnsavedChangesGuard'

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
    // Next copies its own state and synchronizes useSearchParams for external writes.
    else window.history.replaceState(window.history.state?.[SENTINEL] ? { [SENTINEL]: true } : null, '', url)
  }, [pathname, serialize])
  return [query, setQuery]
}
