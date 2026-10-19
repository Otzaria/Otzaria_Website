// תגיות הפלטפורמות הנתמכות של תוסף — משותף לכרטיס התוסף (PluginCard) ולדף
// פרטי התוסף. מקור הנתונים: "platforms" ב-manifest.json (ראו src/lib/pluginPlatforms.js).
//
// תוסף שלא הגביל את עצמו (רשימה ריקה או מלאה) זמין בכל הפלטפורמות: בכרטיס לא
// מוצג דבר (כדי לא להעמיס על רוב התוספים), ובדף התוסף מוצג "כל הפלטפורמות"
// (showAllLabel).

import {
  PLUGIN_PLATFORMS,
  hasPlatformRestriction,
  normalizeManifestPlatforms
} from '@/lib/pluginPlatforms'

interface PlatformBadgesProps {
  platforms?: string[] | null
  // מה להציג כשהתוסף אינו מוגבל: כלום (ברירת מחדל) או התווית "כל הפלטפורמות"
  showAllLabel?: boolean
  className?: string
  badgeClassName?: string
}

const DEFAULT_BADGE_CLASS =
  'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-surface text-on-surface/60'

export default function PlatformBadges({
  platforms,
  showAllLabel = false,
  className = 'flex flex-wrap items-center gap-1.5',
  badgeClassName = DEFAULT_BADGE_CLASS
}: PlatformBadgesProps) {
  if (!hasPlatformRestriction(platforms)) {
    if (!showAllLabel) return null
    return <span className="font-bold text-on-surface">כל הפלטפורמות</span>
  }

  const supported = new Set(normalizeManifestPlatforms(platforms))
  const items = PLUGIN_PLATFORMS.filter((p) => supported.has(p.id))
  const label = `פלטפורמות נתמכות: ${items.map((p) => p.label).join(', ')}`

  return (
    <ul className={className} aria-label={label} title={label}>
      {items.map((p) => (
        <li key={p.id} className={badgeClassName}>
          <span className="material-symbols-outlined text-sm leading-none" aria-hidden="true">{p.icon}</span>
          {/* שמות מערכות ההפעלה בלטינית — בידוד כיווני בתוך ממשק RTL */}
          <bdi>{p.label}</bdi>
        </li>
      ))}
    </ul>
  )
}
