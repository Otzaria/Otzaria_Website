import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import { AdminHeaderSkeleton, TabsSkeleton } from '@/components/admin/list/AdminListSkeleton'
import { MESSAGES_TITLE, messagesDescription } from '@/lib/adminMessagesScreen/messageTerms'
import {
  AREA_CHECK, AREA_MAIN, AREA_MAIN_SENT, AREA_MENU, AREA_PRIMARY, AREA_TIME, INBOX_ROW_GRID, ROW_PADDING, SENT_ROW_GRID,
} from './messageRowLayout'

const NAME_WIDTHS = ['w-28', 'w-36', 'w-24', 'w-32', 'w-40', 'w-28', 'w-32', 'w-24']

/**
 * שלד הרשימה — אותן עמודות ואותו גובה כמו השורות (messageRowLayout), ומעליו הסינון ושורת הכלים באותה מידה, כך
 * שכשהנתונים מגיעים שום דבר לא זז. aria-hidden; ההכרזה "טוען…" — אצל הקורא.
 * @param {{ view?: string, rows?: number }} props
 */
export function MessagesListSkeleton({ view = 'inbox', rows = 8 }) {
  const inbox = view !== 'sent'
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        <Skeleton className="h-(--field-height-md) min-w-0 flex-1" />
        {inbox && <Skeleton className="mb-1.5 h-(--chip-height) w-28 rounded-(--radius-pill)" />}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex min-h-14 items-center gap-1 px-1 py-1 sm:px-2">
          {inbox && <span className="flex size-(--touch-target) items-center justify-center"><Skeleton className="size-5 rounded-(--radius-sm)" /></span>}
          <Skeleton shape="text" className="w-20 text-body-sm" />
        </div>
        <Card as="div" className="@container overflow-hidden">
          <ul className="divide-y divide-outline-variant/60">
            {Array.from({ length: rows }, (_, i) => (
              <li key={i} className={cx(inbox ? INBOX_ROW_GRID : SENT_ROW_GRID, ROW_PADDING)}>
                {inbox && <div className={cx(AREA_CHECK, 'flex size-(--touch-target) items-center justify-center')}><Skeleton className="size-5 rounded-(--radius-sm)" /></div>}
                <div className={inbox ? AREA_MAIN : AREA_MAIN_SENT}>
                  <p className="text-title-sm"><Skeleton shape="text" className={cx('inline-block align-middle', NAME_WIDTHS[i % NAME_WIDTHS.length])} /></p>
                  <p className="mt-0.5 text-body-sm"><Skeleton shape="text" className="inline-block w-3/4 align-middle" /></p>
                </div>
                <div className={AREA_TIME}><Skeleton shape="text" className="w-12" /></div>
                <div className={AREA_PRIMARY}><Skeleton className="h-7 w-14 rounded-(--radius-pill)" /></div>
                <div className={cx(AREA_MENU, 'flex size-(--touch-target) items-center justify-center')}><Skeleton shape="circle" className="size-6" /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

/**
 * מקום ל"הודעה חדשה" ול"רענן" — הכפתורים עצמם, שקופים, מתחת לשלד: אותו רוחב כמו במסך. בתזכורות "הודעה חדשה"
 * משני (tonal) — אותו רוחב.
 */
const ACTION = (
  <>
    <span className="relative inline-flex">
      <Button variant="filled" size="sm" icon="edit" tabIndex={-1} className="invisible">הודעה חדשה</Button>
      <Skeleton className="absolute inset-0" />
    </span>
    <span className="flex size-(--touch-target) items-center justify-center"><Skeleton shape="circle" className="size-6" /></span>
  </>
)

/**
 * כל המסך בטעינה (Suspense ב-page.jsx — יודע את הלשונית ואת התפקיד): כותרת, לשוניות (בדיוק אלה שיוצגו, עם מקום
 * למונה של "נכנסות") ורשימה; תזכורות — מקום לאשף.
 */
export function MessagesScreenSkeleton({ view = 'inbox', canRemind = true }) {
  const labels = [{ label: 'נכנסות', count: '8' }, 'נשלחו', ...(canRemind ? ['תזכורות'] : [])]
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="sr-only">טוען את ההודעות…</p>
      <AdminHeaderSkeleton title={MESSAGES_TITLE} description={messagesDescription(canRemind)} action={ACTION} menu={false} />
      <TabsSkeleton labels={labels} />
      {view === 'reminders' ? <Skeleton className="h-80 w-full rounded-(--card-radius)" /> : <MessagesListSkeleton view={view} />}
    </div>
  )
}

/** loading.jsx (מעבר מהסרגל — בלי הכתובת ובלי התפקיד): רק הכותרת ומשטח ניטרלי, בלי לשוניות ובלי שורות */
export function MessagesLoadingSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <p role="status" className="sr-only">טוען את ההודעות…</p>
      <AdminHeaderSkeleton title={MESSAGES_TITLE} description=" " action={ACTION} menu={false} />
      <Skeleton className="h-96 w-full rounded-(--card-radius)" />
    </div>
  )
}
