import type { ReactNode } from 'react'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'

/** כרטיס "זקוק לעזרה?" בסוף מדריך קבוע: אריח, כותרת, טקסט ופעולה אחת. */
export default function DocsHelpCard({ id, icon = 'help', title, children, action }: {
  id: string
  icon?: string
  title: ReactNode
  children: ReactNode
  action: ReactNode
}) {
  return (
    <Card as="section" padding="lg" aria-labelledby={id} className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start">
      <IconTile icon={icon} size="lg" />
      <div className="min-w-0 flex-1">
        <h2 id={id} className="mb-2 font-display text-headline-sm text-on-surface">{title}</h2>
        <p className="mb-4 text-body-md text-on-surface-variant md:text-body-lg">{children}</p>
        {action}
      </div>
    </Card>
  )
}
