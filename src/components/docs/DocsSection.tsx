import type { ReactNode } from 'react'
import IconTile from '@/components/ui/IconTile'

/**
 * אזור בתוך מדריך קבוע (פיתוח): h2 עם אריח אייקון ועוגן (id — יעד תוכן העניינים).
 * אזור ראשון — בלי קו ההפרדה העליון.
 */
export default function DocsSection({ id, icon, title, children }: {
  id: string
  icon: string
  title: ReactNode
  children: ReactNode
}) {
  const headingId = `${id}-heading`
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-24 border-t border-outline-variant pt-8 mt-10 first:mt-0 first:border-t-0 first:pt-0">
      <h2 id={headingId} className="mb-5 flex items-center gap-3 font-display text-headline-sm text-on-surface md:text-headline-md">
        <IconTile icon={icon} size="sm" />
        <span className="min-w-0 text-balance">{title}</span>
      </h2>
      <div className="space-y-5 text-body-md text-on-surface md:text-body-lg">{children}</div>
    </section>
  )
}
