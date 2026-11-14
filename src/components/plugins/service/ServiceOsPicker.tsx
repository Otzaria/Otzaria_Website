'use client'

import AppIcon from '@/components/ui/AppIcon'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { OS_ICONS, OS_LABELS, SERVICE_OS_IDS, type ServiceOs } from './servicePlatforms'

/**
 * בחירת מערכת ההפעלה למתקין. מערכת המבקר נבחרת מראש רק כברירת מחדל; מערכת בלי מתקין מוצגת מעומעמת
 * ואינה ניתנת לבחירה. אפשר תמיד לבחור מערכת אחרת — להורדה למחשב אחר.
 */
export default function ServiceOsPicker({ supported, selected, onSelect, visitorOs, visitorSupported }: {
  supported: ServiceOs[]
  selected: ServiceOs | null
  onSelect: (os: ServiceOs) => void
  visitorOs: string | null
  visitorSupported: boolean
}) {
  const visitorLabel = visitorOs === 'ios' ? 'iOS' : visitorOs && visitorOs in OS_LABELS ? OS_LABELS[visitorOs as ServiceOs] : null
  return (
    <div>
      {visitorLabel && !visitorSupported && (
        <p className="mb-3 text-body-sm text-on-surface-variant opacity-70">
          המערכת שלך ({visitorLabel}) אינה נתמכת בשירות זה. אפשר לבחור מערכת אחרת ולהוריד את המתקין למחשב אחר.
        </p>
      )}
      <div role="group" aria-label="מערכת הפעלה" className="flex flex-wrap gap-2">
        {SERVICE_OS_IDS.map((os) => {
          const isSupported = supported.includes(os)
          const isSelected = selected === os
          return (
            <button
              key={os}
              type="button"
              onClick={() => onSelect(os)}
              disabled={!isSupported}
              aria-pressed={isSelected}
              className={cx(
                'inline-flex min-h-(--touch-target) items-center gap-2 rounded-(--radius-control) border px-3 text-label-lg transition-colors',
                FOCUS_RING,
                isSelected
                  ? 'border-primary bg-surface-selected text-on-surface'
                  : 'border-outline-variant text-on-surface hover:bg-surface-selected',
                !isSupported && 'cursor-not-allowed opacity-50 hover:bg-transparent'
              )}
            >
              <AppIcon name={OS_ICONS[os]} className="text-[1.25rem]" />
              <span>{OS_LABELS[os]}</span>
              {!isSupported && <span className="text-label-sm text-on-surface-variant">(לא נתמך)</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
