import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { QUEUE_CARD_FRAME, QUEUE_CARD_INNER, QUEUE_CARD_INNER_LONG, QUEUE_COUNT_SIDE, QUEUE_COUNT_SIDE_LONG, QUEUE_NOTE_ROW, isLongCount } from './queueLayout'

/**
 * ותק חריג: בצבעי התג warning של ui/Badge (אותם טוקנים), אבל עם גלישת שורה — Badge הוא
 * whitespace-nowrap, ובטקסט מוגדל בטלפון הוא יצא מגבולות הכרטיס.
 */
function StaleNote({ children }) {
  return (
    <span className="inline-flex min-h-(--badge-height-sm) items-center gap-1 rounded-(--badge-radius) bg-warning-container px-2.5 text-label-sm text-on-warning-container">
      <AppIcon name="schedule" className="shrink-0 text-[1.15em]" />
      {children}
    </span>
  )
}

/**
 * כרטיס של מקום שיש בו פריטים: שורה קומפקטית, וכל הכרטיס הוא קישור למסך.
 * השם הנגיש הוא משפט אחד שנבנה בלוגיקה (accessibleName) — "העלאות: 3,979 העלאות ממתינות לטיפול.
 * הוותיקה מלפני 11 חודשים" — במקום חיבור של פריטי grid בלי סימני פיסוק.
 * הבלטה: תקלה — אריח ומספר בצבע error; פריט שמחכה זמן חריג — שורת הוותק כתג warning.
 * שורת המשנה תמיד תופסת שורה (גם כשהיא ריקה), כדי שכל הכרטיסים וגם השלד יהיו באותו גובה.
 * @param {{ card: import('@/lib/adminDashboard').QueueCardView }} props
 */
export default function QueueCard({ card }) {
  const isError = card.attention === 'error'
  const long = isLongCount(card.countText)
  return (
    <Card href={card.href} aria-label={card.accessibleName} className={QUEUE_CARD_FRAME} data-queue={card.id}>
      <span className={long ? QUEUE_CARD_INNER_LONG : QUEUE_CARD_INNER}>
        <span className="[grid-area:icon] self-center">
          <IconTile icon={card.icon} size="sm" tone={isError ? 'error' : 'secondary'} />
        </span>
        <span className="[grid-area:title] min-w-0 break-words text-label-lg text-on-surface">{card.title}</span>
        <span
          className={cx(
            '[grid-area:count] text-headline-sm font-bold tabular-nums',
            long ? QUEUE_COUNT_SIDE_LONG : QUEUE_COUNT_SIDE,
            isError ? 'text-error' : 'text-on-surface'
          )}
        >
          {card.countText}
        </span>
        <span className="[grid-area:label] text-body-sm text-on-surface-variant">{card.label}</span>
        <span className={cx(QUEUE_NOTE_ROW, 'text-on-surface-variant')}>
          {card.note && (card.noteIsStale
            ? <StaleNote>{card.note}</StaleNote>
            : card.note)}
        </span>
      </span>
    </Card>
  )
}
