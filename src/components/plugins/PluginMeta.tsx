import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import RatingSummary from '@/components/plugins/RatingSummary'
import StatusBadge from '@/components/plugins/StatusBadge'
import ServiceBadge from '@/components/plugins/service/ServiceBadge'

/**
 * שורת המטא של תוסף — משותפת לכרטיס (PluginCard) ולשורת תוצאת החיפוש (listing/PluginResultRow), כדי
 * שכל פרט יהיה באותו מקום ובאותו מראה בשתיהן:
 *
 *   (קטגוריה)  ★ 4.6 (12)  ⤓ 2,473  גרסה 1.2.0 [בטא]
 *
 * - דירוג מקוצר (כוכב אחד) — רק כשיש מדרגים.
 * - הגרסה ותג הסטטוס הם יחידה אחת שלא נשברת (whitespace-nowrap): התג תמיד צמוד לגרסה, ולא יורד
 *   לבדו לשורה נוספת. כך בכרטיס צר (279px ליד סרגל הצד) השורה נשברת לכל היותר לשתיים.
 * - בלי מפרידים "·": לכל פריט סימן משלו (כוכב, חץ הורדה, המילה "גרסה"), ושורה שנשברת לא מתחילה
 *   או נגמרת ב"·" יתום.
 * - תג סטטוס רק כשהוא מוסיף מידע (בטא / ניסיוני) — "יציב" הוא ברירת המחדל.
 */

/** סטטוס שמוצג כתג בכרטיס/בשורה — רק מה שמוסיף מידע ("יציב" הוא ברירת המחדל ואינו מוצג) */
export function showsStatusBadge(status: string | undefined): boolean {
  return Boolean(status) && status !== 'stable'
}

export interface PluginMetaData {
  version?: string
  status?: string
  downloadCount?: number
  ratingAvg?: number
  ratingCount?: number
  hasService?: boolean
}

export default function PluginMeta({ plugin, category, className }: {
  plugin: PluginMetaData
  /** שם קטגוריה (כשהעמוד יודע אותה ואינו דף הקטגוריה עצמו) */
  category?: string
  className?: string
}) {
  return (
    <p
      className={cx(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-label-md font-normal text-on-surface-variant',
        className
      )}
    >
      {category && <span className="max-w-full truncate">{category}</span>}
      <RatingSummary avg={plugin.ratingAvg} count={plugin.ratingCount} variant="compact" />
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums" title="מספר הורדות">
        <AppIcon name="download" className="text-[1.1em]" />
        <span className="sr-only">הורדות: </span>
        {(plugin.downloadCount || 0).toLocaleString('he-IL')}
      </span>
      {(plugin.version || showsStatusBadge(plugin.status)) && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {plugin.version && <span className="tabular-nums">גרסה {plugin.version}</span>}
          {showsStatusBadge(plugin.status) && <StatusBadge status={plugin.status as string} />}
        </span>
      )}
      {plugin.hasService && <ServiceBadge />}
    </p>
  )
}
