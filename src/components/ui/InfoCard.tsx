import type { CSSProperties, ReactNode } from 'react'
import Card from './Card'
import IconTile from './IconTile'
import { cx } from './cx'

/**
 * כרטיס מידע (לא לחיץ) — AppCard (ui/Card) בשפת כרטיסי היכולות של דף הבית: אריח אייקון
 * וכותרת (h3) באותה שורה, ממורכזים אנכית, והטקסט (children) מתחתיהם לכל רוחב הכרטיס.
 * eyebrow — שורה קטנה מעל הכותרת ("שלב 1").
 * as — התגית (li בתוך רשימה); className — פריסה (w-full / h-full) ואנימציית כניסה או ריחוף
 * אם הצרכן רוצה בהם (FeatureCard). משמש את home/FeatureCard ואת אזורי /offline.
 */
export default function InfoCard({ as = 'div', icon, title, eyebrow, className, style, children }: {
  as?: 'div' | 'li' | 'article'
  icon: string
  title: ReactNode
  eyebrow?: ReactNode
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <Card as={as} padding="md" style={style} className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-center gap-3">
        <IconTile icon={icon} size="md" />
        <div className="min-w-0">
          {eyebrow && <p className="text-label-md text-primary">{eyebrow}</p>}
          <h3 className="text-title-md text-on-surface">{title}</h3>
        </div>
      </div>
      <p className="text-body-sm text-on-surface-variant sm:text-body-md">{children}</p>
    </Card>
  )
}
