import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import { cx } from '@/components/ui/cx'
import RetryButton from './RetryButton'
import { QUEUE_CARD_FRAME, QUEUE_CARD_INNER, QUEUE_NOTE_ROW } from './queueLayout'

/**
 * מקום שלא נטען: אותה שורה קומפקטית כמו כרטיס רגיל (כדי שהפריסה לא תקפוץ), טקסט קבוע
 * ("לא הצלחנו לטעון את המספר") במקום התווית, וכפתור "נסה שוב" במקום המספר.
 * לא קישור — כפתור בתוך קישור הוא אלמנט אינטראקטיבי מקונן.
 * @param {{ card: import('@/lib/adminDashboard').QueueCardView, focusAfterRetry?: string }} props
 */
export default function QueueErrorCard({ card, focusAfterRetry }) {
  const titleId = `queue-${card.id}-title`
  const statusId = `queue-${card.id}-status`
  return (
    <Card as="article" aria-labelledby={titleId} aria-describedby={statusId} className={QUEUE_CARD_FRAME} data-queue={card.id}>
      <div className={QUEUE_CARD_INNER}>
        <span className="[grid-area:icon] self-center">
          <IconTile icon={card.icon} size="sm" />
        </span>
        <h3 id={titleId} className="[grid-area:title] min-w-0 break-words text-label-lg text-on-surface">{card.title}</h3>
        <span className={cx('[grid-area:count] pt-1 @min-[18rem]:self-center @min-[18rem]:pt-0')}>
          <RetryButton describedBy={titleId} focusAfterRetry={focusAfterRetry} />
        </span>
        <p id={statusId} className="[grid-area:label] text-body-sm text-on-surface-variant">{card.label}</p>
        <span className={QUEUE_NOTE_ROW} aria-hidden="true" />
      </div>
    </Card>
  )
}
