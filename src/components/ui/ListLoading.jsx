import Skeleton from './Skeleton'

/**
 * שלד טעינה של רשימה — כמה שורות, בלי לקפוץ כשהנתונים מגיעים. מוכרז לקורא המסך בשם label.
 * @param {{ rows?: number, label?: string }} props
 */
export default function ListLoading({ rows = 3, label = 'טוען…' }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  )
}
