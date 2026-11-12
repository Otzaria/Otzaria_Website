'use client'

import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { parseBooksQuery, serializeBooksQuery } from '@/lib/adminBooks/booksQuery'

/**
 * הסינון והמגירה של המסך — מהכתובת ואליה, דרך history.replaceState / pushState: Next מסנכרן את
 * useSearchParams בלי לבקש את העמוד מהשרת מחדש (הסינון בצד הלקוח).
 * push — לפתיחת מגירה ולמעבר עמוד, כדי ש"אחורה" יסגור את המגירה / יחזיר לעמוד הקודם; סינון —
 * replace, בלי לנפח את ההיסטוריה.
 * @returns {[ReturnType<typeof parseBooksQuery>, (next: ReturnType<typeof parseBooksQuery>, options?: { push?: boolean }) => void]}
 */
export function useBooksQuery() {
  return useUrlQuery(parseBooksQuery, serializeBooksQuery)
}
