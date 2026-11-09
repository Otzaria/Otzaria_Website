import type { CSSProperties } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'

/**
 * משבצת פנויה בסוף רשת (לוח ההנצחה, החברות): כל הכרטיס קישור לדף התרומה, עם מסגרת מקווקוות
 * שמבדילה אותו מהכרטיסים המלאים. ה"כפתור" שבתחתית הוא מראה בלבד (span) — אסור כפתור בתוך קישור.
 */
export default function OpenSlotCard({ title, cta, icon = 'volunteer_activism', href = '/donate', className, style }: {
  title: string
  cta: string
  icon?: string
  href?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <li className={cx('flex', className)} style={style}>
      <Card
        href={href}
        padding="lg"
        className="flex w-full flex-col items-center justify-center gap-4 border border-dashed border-outline-variant text-center"
      >
        <IconTile icon={icon} size="md" />
        <span className="text-balance text-center text-title-sm text-on-surface sm:text-title-md">{title}</span>
        <span className={buttonClasses({ variant: 'tonal', size: 'sm', className: 'pointer-events-none' })}>
          {cta}
          <AppIcon
            name="chevron_left"
            className="text-lg transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          />
        </span>
      </Card>
    </li>
  )
}
