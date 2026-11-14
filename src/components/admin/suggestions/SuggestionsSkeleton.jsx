import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton, FilterBarSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { FILTER_LABELS, SUGGESTIONS_DESCRIPTION, SUGGESTIONS_TITLE } from './suggestionsScreenText'

const TITLE_WIDTHS = ['w-32', 'w-48', 'w-40', 'w-56']

/** כרטיס הצעה בשלד — אותו ריפוד ואותן שורות כמו הכרטיס (הצעה בחלק אחד, עם הערה); הגבהים נמדדו בדפדפן */
function CardSkeleton({ i }) {
  return (
    <Card as="li" className="flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex items-start gap-1">
        <span className="-ms-1.5 -mt-1.5 flex size-(--touch-target) shrink-0 items-center justify-center sm:-ms-2"><Skeleton className="size-5" /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton shape="text" className={cx('max-w-full text-title-md', TITLE_WIDTHS[i % TITLE_WIDTHS.length])} />
          <Skeleton shape="text" className="w-56 max-w-full text-body-sm" />
          <Skeleton shape="text" className="w-64 max-w-full text-body-sm" />
        </span>
        <span className="flex size-(--touch-target) items-center justify-center"><Skeleton shape="circle" className="size-6" /></span>
      </div>
      <Skeleton className="h-27 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-14" />
      </div>
    </Card>
  )
}

/** הרשימה בשלד: שורת הכלים וכרטיסים */
export function SuggestionsListSkeleton({ cards = 4 }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="flex min-h-14 items-center gap-2 px-1 sm:px-2">
        <span className="flex size-(--touch-target) items-center justify-center"><Skeleton className="size-5" /></span>
        <Skeleton shape="text" className="w-20 text-body-sm" />
        <Skeleton className="ms-auto h-9 w-28" />
      </div>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: cards }, (_, i) => <CardSkeleton key={i} i={i} />)}
      </ul>
    </div>
  )
}

/** שורת הסינון בשלד: בטלפון — כפתור "סינון"; ברחב — שלושת הבוררים עם התוויות */
export function SuggestionsFilterSkeleton() {
  return <FilterBarSkeleton labels={FILTER_LABELS} layout="fill3" search={false} />
}

/** המסך כולו (loading.jsx) — כותרת, סינון ורשימה, באותם מרווחים כמו SuggestionsScreen */
export function SuggestionsScreenSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <p role="status" className="sr-only">טוען את הצעות העריכה…</p>
      <AdminHeaderSkeleton title={SUGGESTIONS_TITLE} description={SUGGESTIONS_DESCRIPTION} />
      <SuggestionsFilterSkeleton />
      <SuggestionsListSkeleton />
    </div>
  )
}
