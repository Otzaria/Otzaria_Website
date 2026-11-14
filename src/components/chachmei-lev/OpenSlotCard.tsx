import type { CSSProperties } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'

/**
 * משבצת פנויה בסוף רשת (לוח ההנצחה, החברות): כל הכרטיס קישור לדף התרומה, עם מסגרת מקווקוות
 * שמבדילה אותו מהכרטיסים המלאים. ה"כפתור" שבתחתית הוא כפתור התרומה של האתר (variant="donation",
 * כמו בכותרת וב-DonateCallout) — מראה בלבד (span): אסור כפתור בתוך קישור.
 * icon — חובה, לפי ההקשר: נר בלוח ההנצחה, פלוס במשבצת החברות.
 */
export default function OpenSlotCard({ title, cta, icon, href = '/donate', padding = 'md', className, style }: {
  title: string
  cta: string
  icon: string
  href?: string
  padding?: 'sm' | 'md'
  className?: string
  style?: CSSProperties
}) {
  return (
    <li className={cx('flex', className)} style={style}>
      <Card
        href={href}
        padding={padding}
        className="flex w-full flex-col items-center justify-center gap-2 border border-dashed border-outline-variant text-center"
      >
        <IconTile icon={icon} size="sm" />
        <span className="text-balance text-center text-title-sm text-on-surface">{title}</span>
        <span className={buttonClasses({ variant: 'donation', size: 'sm' })}>
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
