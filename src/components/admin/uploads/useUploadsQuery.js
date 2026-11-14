'use client'

import { useUrlQuery } from '@/components/admin/list/useUrlQuery'
import { parseUploadsQuery, serializeUploadsQuery } from '@/lib/adminUploads/uploadsQuery'

/**
 * הסינון של המסך — מהכתובת ואליה. העדכון דרך history.replaceState / pushState: Next מסנכרן את
 * useSearchParams בלי לבקש את העמוד מהשרת מחדש (הסינון בצד הלקוח — אין סיבה לסבב לשרת בכל אות).
 * push — לשינוי עמוד, כדי ש"אחורה" יחזיר לעמוד הקודם; סינון — replace, בלי לנפח את ההיסטוריה.
 * @returns {[ReturnType<typeof parseUploadsQuery>, (next: ReturnType<typeof parseUploadsQuery>, options?: { push?: boolean }) => void]}
 */
export function useUploadsQuery() {
  return useUrlQuery(parseUploadsQuery, serializeUploadsQuery)
}
