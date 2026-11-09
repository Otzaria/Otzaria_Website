import type { CSSProperties } from 'react'
import Card from '@/components/ui/Card'
import TitleOrnament from '@/components/ui/TitleOrnament'
import { cx } from '@/components/ui/cx'
import CandleIcon from './CandleIcon'

/**
 * כרטיס הנצחה (בתוכנה: _MemorialCard.donor): נר, ההקדשה בגופן התצוגה (Regular בלבד), קישוט
 * דק, ושורות התיאור (מופרדות ב-\n). כרטיס מורם (raised) — לב הדף, נבדל מהרקע בשקט, ובראשו
 * קו דק בזהב הקישוט (--color-glow, כמו הלהבה ונקודת הקישוט) שמייחד את ההקדשות משאר הכרטיסים.
 * overflow-hidden: הקו עוקב אחרי הפינות המעוגלות.
 */
export default function MemorialCard({ title, description, className, style }: {
  title: string
  description?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <Card
      as="li"
      tone="raised"
      padding="lg"
      style={style}
      className={cx(
        'relative flex flex-col items-center overflow-hidden text-center',
        "before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-glow before:content-['']",
        className
      )}
    >
      <CandleIcon className="mb-4" />
      <div className="flex w-fit max-w-full flex-col">
        <h3 className="text-balance font-display text-headline-sm text-on-surface">{title}</h3>
        <TitleOrnament className="mt-4" ratio="50%" min="96px" ringColor="var(--card-bg)" />
      </div>
      {description && (
        <p className="mt-4 whitespace-pre-line text-balance text-body-sm text-on-surface-variant sm:text-body-md">{description}</p>
      )}
    </Card>
  )
}
