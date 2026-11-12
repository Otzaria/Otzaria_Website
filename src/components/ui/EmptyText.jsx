/**
 * אין מה להציג — שורה ממורכזת ושקטה בתוך אזור (בלי אייקון וכותרת, בניגוד ל-ui/EmptyState).
 * @param {{ children: import('react').ReactNode }} props
 */
export default function EmptyText({ children }) {
  return <p className="py-6 text-center text-body-md text-on-surface-variant">{children}</p>
}
