import type { ReactNode } from 'react'
import AppIcon from './AppIcon'
import { cx } from './cx'

/**
 * tone — לפי תפקיד, לא לפי צבע:
 *   neutral — מידע שקט (גרסה, תאריך, ספירה)
 *   primary — קטגוריה / תגית מותג (secondary-container)
 *   success / warning / error / info — מצב (מאושר, ממתין, נדחה, חדש)
 *   donation — הקשור לתרומה
 */
const TONES = {
  neutral: 'bg-surface-container-highest text-on-surface-variant',
  primary: 'bg-secondary-container text-on-secondary-container',
  success: 'bg-success-container text-on-success-container',
  warning: 'bg-warning-container text-on-warning-container',
  error: 'bg-error-container text-on-error-container',
  info: 'bg-info-container text-on-info-container',
  donation: 'bg-donation-container text-on-donation-container'
} as const

const SIZES = {
  sm: 'min-h-(--badge-height-sm) px-2.5 text-label-sm',
  md: 'min-h-(--badge-height-md) px-3 text-label-md'
} as const

export type BadgeTone = keyof typeof TONES
export type BadgeSize = keyof typeof SIZES

/**
 * תג / תגית — טקסט קצר (מילה-שתיים) על רקע טונלי מעוגל לגמרי. לא אינטראקטיבי: תגית שלוחצים
 * עליה (מסנן) היא כפתור (ui/Button variant="tonal" size="sm"), לא Badge.
 * המשמעות חייבת להיות בטקסט — הצבע מחזק בלבד (WCAG 1.4.1).
 */
export default function Badge({ children, tone = 'neutral', size = 'sm', icon, id, className }: {
  children: ReactNode
  /** למשל כדי שאלמנט אחר יפנה אליו ב-aria-describedby */
  id?: string
  tone?: BadgeTone
  size?: BadgeSize
  icon?: string
  className?: string
}) {
  return (
    <span id={id} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-(--badge-radius)', TONES[tone], SIZES[size], className)}>
      {icon && <AppIcon name={icon} className="text-[1.15em]" />}
      {children}
    </span>
  )
}
