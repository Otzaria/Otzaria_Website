import { cx } from '@/components/ui/cx'

const TONES = {
  // מונה רגיל ליד פריט בקבוצה שלו — שקט (טונלי)
  neutral: 'bg-secondary-container text-on-secondary-container',
  // על פריט פעיל (שהרקע שלו כבר טונלי) — משטח בהיר, כדי שהמונה לא ייבלע
  onActive: 'bg-surface text-on-secondary-container',
  // "דורש טיפול" — אדום מלא
  error: 'bg-error text-on-error',
}

/**
 * מונה (pill) ליד פריט בסרגל. המספר עצמו מוסתר מקוראי מסך, ובמקומו נקרא הטקסט המלא
 * ("3 הודעות שלא נקראו") — כך שם הקישור הוא "הודעות, 3 הודעות שלא נקראו" ולא "הודעות 3".
 */
export default function AdminNavCount({ count, accessibleLabel, tone = 'neutral', className }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cx(
          'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-(--radius-pill) px-1.5 text-label-sm tabular-nums',
          TONES[tone],
          className
        )}
      >
        {Number(count).toLocaleString('he-IL')}
      </span>
      <span className="sr-only">{`, ${accessibleLabel}`}</span>
    </>
  )
}
