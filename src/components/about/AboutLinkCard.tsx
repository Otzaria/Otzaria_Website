import type { ReactNode } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'

/**
 * כרטיס-קישור פנימי (ui/Card href — כל הכרטיס מטרת המגע, עם טבעת הפוקוס של Card): אריח, טקסט,
 * וחץ "הלאה" — שמאלה ב-RTL. החץ זז מעט בריחוף, ולא ב-reduced-motion.
 */
export default function AboutLinkCard({ href, icon, children }: {
  href: string
  icon: string
  children: ReactNode
}) {
  return (
    <Card href={href} padding="md" className="flex h-full w-full items-center gap-3">
      <IconTile icon={icon} size="md" />
      <span className="min-w-0 flex-1 text-title-sm text-on-surface">{children}</span>
      <AppIcon
        name="chevron_left"
        className="shrink-0 text-on-surface-variant transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      />
    </Card>
  )
}
