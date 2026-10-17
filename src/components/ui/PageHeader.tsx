import type { ReactNode } from 'react'
import SectionHeading from './SectionHeading'
import { cx } from './cx'

/**
 * כותרת העמוד (h1) — אחת לעמוד, בראשו. מאחדת את כותרות העמודים באתר: היום כל עמוד צובע את
 * ה-h1 אחרת (on-surface / primary / primary-dark (לא מוגדר) / neutral-cool-900...), ובגופן
 * אחר (font-frank מול font-display). כאן: on-surface, גופן התצוגה, אותו סולם כמו כותרת אזור,
 * עם הקישוט. actions — כפתורים אופציונליים מתחת לשורת המשנה (למשל "העלאת תוסף").
 */
export default function PageHeader({ title, subtitle, actions, align = 'center', ornament = true, id, className }: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  align?: 'center' | 'start'
  ornament?: boolean
  id?: string
  className?: string
}) {
  const heading = (
    <SectionHeading
      as="h1"
      id={id}
      title={title}
      subtitle={subtitle}
      align={align}
      ornament={ornament}
      spacing={actions ? 'none' : 'default'}
      className={actions ? undefined : className}
    />
  )
  if (!actions) return heading
  return (
    <header className={cx('mb-8 flex flex-col gap-6 md:mb-10', align === 'center' ? 'items-center' : 'items-start', className)}>
      {heading}
      <div className="flex flex-wrap gap-3">{actions}</div>
    </header>
  )
}
