import type { ReactNode } from 'react'
import IconTile from '@/components/ui/IconTile'
import PageHeader from '@/components/ui/PageHeader'
import { cx } from '@/components/ui/cx'

/**
 * כותרת דף מדריך: אריח אייקון + PageHeader (h1 בגופן התצוגה, הקישוט, שורת משנה).
 * center — דף הבית של המדריכים ודף הפיתוח; start — דף ויקי (מעל עמודת הקריאה).
 */
export default function DocsHero({ id, icon, title, subtitle, align = 'center', className }: {
  id: string
  icon: string
  title: ReactNode
  subtitle?: ReactNode
  align?: 'center' | 'start'
  className?: string
}) {
  const center = align === 'center'
  return (
    <div className={cx('flex', center ? 'flex-col items-center' : 'items-start gap-4', className)}>
      {center ? (
        <IconTile icon={icon} size="lg" className="mb-4" />
      ) : (
        // בנייד בלי האריח (הכותרת לבד, ברוחב מלא); העטיפה מסתירה — IconTile עצמו inline-flex
        <span className="mt-1 hidden sm:block">
          <IconTile icon={icon} size="lg" />
        </span>
      )}
      <PageHeader id={id} title={title} subtitle={subtitle} align={align} />
    </div>
  )
}
