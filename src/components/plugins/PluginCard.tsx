'use client'

// כרטיס תוסף משותף (בית החנות, כל התוספים, קטגוריה). ה-hook של ההתקנה הישירה (useDirectInstall)
// נשאר ברמת הדף; הכרטיס מקבל את מצב ההתקנה ואת ה-handler כ-props.
//
// בנוי לסריקה מהירה (מפרט: refactor-notes/redesign/plugins-design-spec.md, "סריקה מהירה" ו-"PluginCard"):
// כל פריט מידע במקום קבוע בכל כרטיס, כך שהעין עוברת בקו ישר לאורך שורה של כרטיסים.
//
//   [אייקון]  שם התוסף (בולט, עד 2 שורות)     ← כל הכרטיס הוא הקישור לעמוד התוסף
//             ★ 4.6 (12)  ⤓ 2,473  גרסה 1.2.0 [בטא]   ← שורת מטא (PluginMeta), טקסט משני
//   תיאור קצר — תמיד בגובה שתי שורות (נחתך עם "…")
//   [הורדה] [התקנה ישירה]                       ← דבוק לתחתית; מעל הקישור (z), לחיצים בנפרד
//
// מה *לא* בכרטיס (בכוונה — רעש לסריקה): תגיות, תאריך עדכון, תג "יציב" (מצב ברירת המחדל — התג מופיע
// רק כשהוא מוסיף מידע: בטא / ניסיוני). כולם בעמוד התוסף.
//
// "כל הכרטיס לחיץ" בלי אלמנט אינטראקטיבי מקונן: הקישור הוא שם התוסף, ו-::after שלו נמתח על כל
// הכרטיס (stretched link). הכפתורים יושבים מעליו (relative + z-raised). טבעת הפוקוס של הקישור
// מצוירת על ה-::after — סביב הכרטיס כולו.

import Link from 'next/link'
import { cx } from '@/components/ui/cx'
import PluginImage from '@/components/plugins/PluginImage'
import PluginInstallActions from '@/components/plugins/PluginInstallActions'
import PluginMeta from '@/components/plugins/PluginMeta'
import type { DirectInstallState } from '@/components/plugins/useDirectInstall'
import type { PluginCardData } from '@/components/plugins/types'


interface PluginCardProps {
  plugin: PluginCardData
  installState: DirectInstallState
  onInstall: (plugin: PluginCardData) => void
  // הכרטיס הראשון בדף (בדרך כלל ה-LCP): התמונה נטענת מיד ובעדיפות גבוהה
  // במקום lazy — lazy מחכה לחישוב הפריסה לפני שהבקשה בכלל יוצאת.
  priority?: boolean
  /** רמת הכותרת של שם התוסף — h3 מתחת לכותרת אזור (h2), h2 כשהרשת ישירות מתחת ל-h1 */
  headingLevel?: 'h2' | 'h3'
  /** שם קטגוריה לשורת המטא (כשהדף יודע אותה ואינו כבר דף הקטגוריה עצמו) */
  category?: string
  className?: string
}

export default function PluginCard({
  plugin,
  installState,
  onInstall,
  priority = false,
  headingLevel: Heading = 'h3',
  category,
  className
}: PluginCardProps) {
  const href = `/plugins/${plugin.id}`

  return (
    <article
      className={cx(
        'group relative flex h-full flex-col gap-3 rounded-(--card-radius) bg-(--card-bg) p-4 transition-colors hover:bg-(--card-bg-hover) sm:p-5',
        className
      )}
    >
      {/* כותרת: אייקון (מקום קבוע) + שם + שורת מטא */}
      <div className="flex items-start gap-4">
        <PluginImage src={plugin.image} size="md" responsive="lg" priority={priority} />
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
                // stretched link: כל הכרטיס מטרת הקישור; הפוקוס — טבעת סביב הכרטיס
                "after:absolute after:inset-0 after:rounded-(--card-radius) after:content-['']",
                'focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus-ring'
              )}
            >
              {plugin.name}
            </Link>
          </Heading>

          <PluginMeta plugin={plugin} category={category} className="mt-1.5" />
        </div>
      </div>

      {/* תיאור — תמיד בגובה שתי שורות, כדי שהכפתורים בשורת כרטיסים יהיו בקו אחד */}
      <p dir="auto" className="line-clamp-2 min-h-[calc(2lh)] break-words text-right text-body-sm text-on-surface-variant">
        {plugin.shortDescription}
      </p>

      <PluginInstallActions
        plugin={plugin}
        installState={installState}
        onInstall={(downloadUrl) => onInstall(downloadUrl ? { ...plugin, downloadUrl } : plugin)}
        emphasis="card"
        className="relative z-(--z-raised) mt-auto pt-1"
      />
    </article>
  )
}
