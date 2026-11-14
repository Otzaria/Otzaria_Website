import type { ReactNode } from 'react'
import PluginImage from '@/components/plugins/PluginImage'
import StatusBadge, { PluginStateBadge } from '@/components/plugins/StatusBadge'
import ServiceBadge from '@/components/plugins/service/ServiceBadge'
import SectionHeading from '@/components/ui/SectionHeading'
import { cx } from '@/components/ui/cx'
import PluginKeyFacts from './PluginKeyFacts'
import UserText from './UserText'
import { heroDescription } from './pluginDetailModel'
import type { Plugin } from './types'

/**
 * ראש עמוד התוסף — כל מה שצריך כדי להחליט, מעל הקפל (S13), בסדר קבוע:
 *
 *   מתחת ל-lg (עמודה אחת):            מ-lg, כשיש צילומי מסך (שתי עמודות):
 *   [אייקון] שם (h1)                    [אייקון] שם (h1)       │  ┌ קרוסלת צילומי מסך ┐
 *            [יציב]                              [יציב]         │  │                    │
 *   תיאור קצר                           תיאור קצר              │  └────────────────────┘
 *   [הורדה] [התקנה ישירה לאוצריא]        [הורדה] [התקנה ישירה]  │      • ━ • •      ⏸
 *   מקור · דיווח למפתח · ערוך            מקור · דיווח למפתח      │
 *   ┌ דירוג │ הורדות │ גרסה │ … ┐        ┌ דירוג │ הורדות │ גרסה │ תאימות │ מפתח ┐ (לכל הרוחב)
 *   ┌ קרוסלת צילומי מסך ┐
 *
 * למה לצד ולא מתחת בדסקטופ: ב-1280 עמודת הכותרת תופסת רק חצי מהרוחב, והצד השני היה ריק; שם
 * הקרוסלה גלויה במלואה מעל הקפל בלי לדחוף את ההורדה/הדיווח/נתוני המפתח למטה. מתחת ל-lg אין מקום
 * לצד — היא מיד אחרי נתוני המפתח (תחילתה גלויה ב-390×844).
 *
 * האייקון (hero: 96 → 120 → 168, bleed — השוליים הלבנים המובנים באייקונים נחתכים מעט) alt="" — השם
 * כתוב ב-h1 שלצדו. priority — מועמד ל-LCP. שם ותיאור — טקסט המפתח: dir="auto" ויישור לימין.
 */
export default function PluginHero({ plugin, titleId, actions, secondaryActions, media, className }: {
  plugin: Plugin
  titleId: string
  actions: ReactNode
  secondaryActions?: ReactNode
  /** קרוסלת צילומי המסך — לצד הכותרת מ-lg, אחרי נתוני המפתח מתחתיו */
  media?: ReactNode
  className?: string
}) {
  const description = heroDescription(plugin)
  const sideMedia = Boolean(media)
  return (
    <div
      className={cx(
        'grid gap-y-6 md:gap-y-8',
        sideMedia && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] xl:gap-x-12',
        className
      )}
    >
      <div className={cx('min-w-0', sideMedia && 'lg:col-start-1 lg:row-start-1 lg:self-center')}>
        <div className="flex items-center gap-4 sm:gap-6">
          <PluginImage src={plugin.image} size="hero" bleed priority />
          <div className="min-w-0 flex-1">
            <SectionHeading
              as="h1"
              id={titleId}
              title={<span dir="auto" className="break-words">{plugin.name}</span>}
              size="lg"
              align="start"
              spacing="none"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={plugin.status} size="md" />
              {plugin.isSuspended && <PluginStateBadge state="suspended" size="md" />}
              {plugin.isHistoricalVersion && <PluginStateBadge state="historical" size="md" />}
              {plugin.hasService && <ServiceBadge size="md" />}
            </div>
          </div>
        </div>

        {description && (
          <UserText
            text={description}
            paragraphClassName="mt-2"
            className="mt-4 max-w-measure text-body-md text-on-surface-variant md:mt-5 md:text-body-lg"
          />
        )}

        <div className="mt-5 flex flex-col gap-2">
          {actions}
          {secondaryActions}
        </div>
      </div>

      <PluginKeyFacts plugin={plugin} className={cx(sideMedia && 'lg:col-span-2 lg:row-start-2')} />

      {media && <div className="min-w-0 lg:col-start-2 lg:row-start-1">{media}</div>}
    </div>
  )
}
