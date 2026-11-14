import type { CSSProperties } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import IconTile from '@/components/ui/IconTile'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { cx } from '@/components/ui/cx'
import { SLOT_EMAIL } from '@/lib/chachmei-lev-data'

/**
 * משבצת פנויה בסוף רשת (לוח ההנצחה, החברות): כל הכרטיס קישור לשליחת מייל (mailto עם נושא מוכן),
 * עם מסגרת מקווקוות שמבדילה אותו מהכרטיסים המלאים. ה"כפתור" שבתחתית בסגנון כפתור התרומה של האתר
 * (variant="donation") — מראה בלבד (span): אסור כפתור בתוך קישור. כתובת המייל מוצגת מתחתיו, למי
 * שאין לו תוכנת דואר שנפתחת מהקישור.
 * icon — חובה, לפי ההקשר: נר בלוח ההנצחה, פלוס במשבצת החברות.
 */
export default function OpenSlotCard({ title, cta, icon, href, padding = 'md', compact = false, className, style }: {
  title: string
  cta: string
  icon: string
  href: string
  padding?: 'sm' | 'md'
  /** משבצת קטנה (החברות): בנייד אין מקום לשורת הכתובת — היא מוצגת רק מ-sm */
  compact?: boolean
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
          <AppIcon name="mail" className="text-lg" />
        </span>
        <span dir="ltr" className={cx('text-label-sm text-on-surface-variant', compact && 'hidden sm:inline')}>{SLOT_EMAIL}</span>
      </Card>
    </li>
  )
}
