import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import type { NotFoundLink } from './notFoundLinkData'

/**
 * דרכי ההמשך בדף 404: ניווט עם כותרת (h2), ובו רשימת כרטיסים לחיצים (ui/Card href —
 * כל הכרטיס מטרת המגע, עם טבעת הפוקוס של Card). בנייד טור אחד, מ-sm שני טורים.
 */
export default function NotFoundLinks({ links, headingId = 'not-found-links-heading' }: {
  links: readonly NotFoundLink[]
  headingId?: string
}) {
  return (
    <nav aria-labelledby={headingId} className="w-full">
      <h2 id={headingId} className="mb-4 text-center font-display text-headline-sm text-on-surface">
        לאן להמשיך
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href} className="flex">
            <Card href={link.href} padding="md" className="flex w-full items-center gap-3">
              <IconTile icon={link.icon} size="md" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold text-on-surface">{link.label}</span>
                <span className="text-sm text-on-surface-variant">{link.description}</span>
              </span>
              <AppIcon
                name="chevron_left"
                className="shrink-0 text-on-surface-variant transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              />
            </Card>
          </li>
        ))}
      </ul>
    </nav>
  )
}
