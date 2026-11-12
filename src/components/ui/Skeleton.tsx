import type { CSSProperties } from 'react'
import { cx } from './cx'

/**
 * צורה — רק הרדיוס; המידות (רוחב/גובה) ב-className של הצרכן, כדי שהשלד ישקף בדיוק את התוכן שיגיע:
 *   block — מלבן בפינות הצורה (כרטיס, תמונה, כפתור)
 *   text  — שורת טקסט (פינות קטנות, גובה 1em ברירת מחדל — לפי גודל הטקסט של ההורה)
 *   pill  — תגית / שבב
 *   circle — עיגול (אווטאר)
 */
const SHAPES = {
  block: 'rounded-(--radius-shape)',
  text: 'h-[1em] rounded-(--radius-sm)',
  pill: 'rounded-(--radius-pill)',
  circle: 'rounded-full'
} as const

export type SkeletonShape = keyof typeof SHAPES

/**
 * שלד טעינה — משטח במקום תוכן שעוד לא הגיע, באותן מידות, כדי שלא תהיה קפיצת פריסה.
 * דקורטיבי בלבד (aria-hidden): ההכרזה "טוען…" שייכת להורה (למשל Loader עם sr-only, או aria-busy
 * על האזור). פעימת שקיפות עדינה; ב-reduced-motion — סטטי (לולאה = תנועה שאין צורך בה).
 * Server Component.
 */
export default function Skeleton({ shape = 'block', className, style }: {
  shape?: SkeletonShape
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden="true"
      data-skeleton=""
      style={style}
      className={cx('block animate-pulse bg-(--skeleton-bg) motion-reduce:animate-none', SHAPES[shape], className)}
    />
  )
}
