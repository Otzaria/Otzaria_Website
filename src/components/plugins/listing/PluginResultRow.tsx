'use client'

// שורת תוצאה בדף החיפוש — רשימה אנכית (סדר הדירוג חשוב, ולכן לא רשת). אותה שפה ואותו סדר כמו
// PluginCard, כדי שמי שעבר מהחנות לחיפוש ימצא כל פרט באותו מקום:
//
//   [אייקון]  שם התוסף (מילות החיפוש מודגשות)                 [הורדה      ]
//             ★ 4.6 (12)   ⤓ 2,473   גרסה 1.2.0   [בטא]       [התקנה ישירה]
//             תיאור קצר — עד שתי שורות
//             (קטגוריה) (קטגוריה)
//
// בנייד הפעולות יורדות לשורה משלהן מתחת לתוכן, זו לצד זו. מ-sm — עמודה צרה בקצה הסוף, אחת מעל
// השנייה (PluginInstallActions layout="row" בתוך עמודה של 11rem: הכפתורים נשברים לשורות ומתמלאים
// לרוחב העמודה).
//
// כל השורה לחיצה (stretched link על השם, כמו בכרטיס); שבבי הקטגוריות והכפתורים מעליו (z-raised).

import Link from 'next/link'
import Chip from '@/components/ui/Chip'
import Skeleton from '@/components/ui/Skeleton'
import { cx } from '@/components/ui/cx'
import PluginImage from '@/components/plugins/PluginImage'
import PluginInstallActions from '@/components/plugins/PluginInstallActions'
import PluginMeta from '@/components/plugins/PluginMeta'
import { highlightMatches } from '@/components/plugins/PluginSearchBox'
import type { DirectInstallState } from '@/components/plugins/useDirectInstall'
import type { PluginSearchResult } from '@/components/plugins/types'

const ROW = 'relative flex flex-col gap-4 rounded-(--card-radius) bg-(--card-bg) p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5'
const ACTIONS_COLUMN = 'sm:w-44 sm:shrink-0'

export default function PluginResultRow({
  plugin,
  query,
  installState,
  onInstall,
  priority = false,
  headingLevel: Heading = 'h2'
}: {
  plugin: PluginSearchResult
  query: string
  installState: DirectInstallState
  onInstall: (plugin: PluginSearchResult) => void
  priority?: boolean
  headingLevel?: 'h2' | 'h3'
}) {
  const href = `/plugins/${plugin.id}`
  const categories = plugin.categories || []

  return (
    <article className={cx(ROW, 'group transition-colors hover:bg-(--card-bg-hover) motion-reduce:transition-none')}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <PluginImage src={plugin.image} size="md" priority={priority} />
        <div className="min-w-0 flex-1">
          <Heading className="text-title-md text-on-surface">
            <Link
              href={href}
              prefetch={false}
              title={plugin.name}
              // טקסט של המפתח — אולי באנגלית: dir="auto" מסדר את הסימנים (נקודה בסוף), והיישור נשאר לימין כמו העמוד
              dir="auto"
              className={cx(
                'line-clamp-2 break-words text-right outline-none transition-colors group-hover:text-primary',
                "after:absolute after:inset-0 after:rounded-(--card-radius) after:content-['']",
                'focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus-ring'
              )}
            >
              {highlightMatches(plugin.name, query)}
            </Link>
          </Heading>

          {/* שורת מטא — אותו רכיב כמו בכרטיס */}
          <PluginMeta plugin={plugin} className="mt-1.5" />

          {plugin.shortDescription && (
            <p dir="auto" className="mt-2 line-clamp-2 break-words text-right text-body-sm text-on-surface-variant">
              {plugin.shortDescription}
            </p>
          )}

          {categories.length > 0 && (
            // מעל הקישור הנמתח; pointer-events רק על השבבים עצמם — הרווח ביניהם נשאר חלק מהשורה הלחיצה
            <div className="pointer-events-none relative z-(--z-raised) mt-3 flex flex-wrap gap-x-2 gap-y-2.5">
              {categories.map((category) => (
                <Chip key={category.slug} href={`/plugins/category/${category.slug}`} className="pointer-events-auto">
                  {category.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      <PluginInstallActions
        plugin={plugin}
        installState={installState}
        onInstall={(downloadUrl) => onInstall(downloadUrl ? { ...plugin, downloadUrl } : plugin)}
        emphasis="card"
        className={cx('relative z-(--z-raised)', ACTIONS_COLUMN)}
      />
    </article>
  )
}

/** שלד של שורת תוצאה — אותו מבנה ואותן מידות; דקורטיבי (ההכרזה "טוען" אצל ההורה) */
export function PluginResultRowSkeleton() {
  return (
    <div aria-hidden="true" className={ROW}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <Skeleton className="size-(--plugin-icon-size-md) shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
          <Skeleton shape="text" className="w-1/2 text-title-md" />
          <Skeleton shape="text" className="w-2/5 text-label-md" />
          <div className="mt-1 flex flex-col gap-2 text-body-sm">
            <Skeleton shape="text" className="w-full" />
            <Skeleton shape="text" className="w-4/5" />
          </div>
        </div>
      </div>
      <div className={cx('flex gap-2 sm:flex-col', ACTIONS_COLUMN)}>
        <Skeleton className="h-(--button-height-sm) flex-1 sm:flex-none" />
        <Skeleton className="h-(--button-height-sm) flex-1 sm:flex-none" />
      </div>
    </div>
  )
}
