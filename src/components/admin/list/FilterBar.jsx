'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import SearchField from '@/components/ui/SearchField'
import { cx } from '@/components/ui/cx'
import { filterLayout, filterPanelClass } from './filterBarLayout'

/**
 * סרגל הסינון המשותף של מסכי הרשימה בניהול: חיפוש (מקש "/" מתמקד בו), ובוררים (children — ui/SelectMenu) עם
 * "נקה סינון" בסוף השורה. "נקה סינון" שומר את מקומו גם כשאין סינון (נסתר), כך שהבוררים לא מתכווצים כשהוא מופיע.
 * ברשימה צרה (טלפון) הבוררים מקופלים מאחורי "סינון (2)", וכשיש סינון — שורה שאומרת מה מסונן ("מסונן: לא נבדק,
 * משה"), כדי שיהיה ברור למה הרשימה קצרה.
 * בלי children — רק שורת החיפוש (ו-aside לידה, למשל צ'יפ "רק חדשות"); בלי search — רק הבוררים.
 *
 * @param {{
 *   panelId?: string,
 *   layout?: keyof typeof import('./filterBarLayout').FILTER_LAYOUTS,
 *   search?: { label: string, placeholder: string, value: string, onSearch: (q: string) => void },
 *   aside?: import('react').ReactNode,
 *   count?: number,
 *   summary?: string[],
 *   active?: boolean,
 *   onClear?: () => void,
 *   disabled?: boolean,
 *   children?: import('react').ReactNode,
 * }} props
 * count — מספר הבוררים הפעילים (על כפתור "סינון"); active — יש מה לנקות ("נקה סינון" גלוי);
 * disabled — פעולה מרובה באמצע: "נקה" נעול (את הבוררים נועל המסך עצמו).
 */
export default function FilterBar({
  panelId, layout = 'fill3', search, aside, count = 0, summary = [], active = false, onClear, disabled = false, children,
}) {
  const [open, setOpen] = useState(false)
  const hasPanel = Boolean(children)
  const bp = filterLayout(layout)
  const showSummary = hasPanel && !open && summary.length > 0
  const summaryText = `מסונן: ${summary.join(', ')}`

  const toggle = hasPanel && (
    <Button
      variant={count > 0 ? 'tonal' : 'outlined'}
      size="sm"
      icon="filter_list"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen((v) => !v)}
      className={search ? bp.compact : 'shrink-0'}
    >
      {count > 0 ? `סינון (${count})` : 'סינון'}
    </Button>
  )
  const clearShort = active && (
    <Button variant="text" size="sm" icon="filter_alt_off" onClick={onClear} softDisabled={disabled} className="shrink-0">נקה</Button>
  )

  return (
    <div className="@container flex flex-col gap-3">
      {search ? (
        <>
          <div className="flex items-end gap-2">
            <SearchField label={search.label} placeholder={search.placeholder} value={search.value} onSearch={search.onSearch} className="min-w-0 flex-1" />
            {aside}
            {toggle}
          </div>
          {showSummary && (
            <div className={cx('flex items-center gap-2 text-body-sm text-on-surface-variant', bp.compact)}>
              <p title={summaryText} className="min-w-0 flex-1 truncate">{summaryText}</p>
              {clearShort}
            </div>
          )}
        </>
      ) : (
        hasPanel && (
          <div className={cx('flex min-h-10 items-center gap-2', bp.compact)}>
            {toggle}
            {showSummary && (
              <>
                <p title={summaryText} className="min-w-0 flex-1 truncate text-body-sm text-on-surface-variant">{summaryText}</p>
                {clearShort}
              </>
            )}
          </div>
        )
      )}

      {hasPanel && (
        <div id={panelId} className={filterPanelClass(layout, open)}>
          {children}
          <Button
            variant="text"
            size="sm"
            icon="filter_alt_off"
            onClick={onClear}
            softDisabled={disabled}
            aria-hidden={!active || undefined}
            tabIndex={active ? undefined : -1}
            className={cx('justify-self-start', !active && bp.clearHidden)}
          >
            נקה סינון
          </Button>
        </div>
      )}
    </div>
  )
}
