'use client'

import { memo } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Badge from '@/components/ui/Badge'
import Checkbox from '@/components/ui/Checkbox'
import Ltr from '@/components/ui/Ltr'
import MenuButton from '@/components/ui/MenuButton'
import { cx } from '@/components/ui/cx'
import { displayName, downloadsText, ratingAverage, storeState } from '@/lib/adminPlugins/pluginTerms'
import PluginThumb from './PluginThumb'
import { storeMenuItems } from './pluginRowActions'
import { AREA_CHECK, AREA_MAIN, AREA_MENU, AREA_PRIMARY, AREA_STATS, AREA_THUMB, ROW_NAME, ROW_PADDING, STORE_ROW_GRID } from './pluginRowLayout'
import OpenChip from '@/components/admin/list/OpenChip'

function Rating({ plugin }) {
  if (!plugin.ratingCount) return <span className="text-on-surface-variant">אין דירוג</span>
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      {ratingAverage(plugin.ratingAvg)}
      <AppIcon name="star" className="text-icon-sm text-rating" />
      <span className="sr-only">מתוך 5, {plugin.ratingCount} דירוגים</span>
    </span>
  )
}

/**
 * שורה ב"בחנות": בחירה, תמונה, שם (ותג "מושהה" — רק הוא מסומן; מוצג בחנות הוא ברירת המחדל), שורת
 * פרטים (מפתח · גרסה · קטגוריות), הורדות ודירוג, "פתח" (המגירה) ו-⋮ לשאר.
 * ברשימה צרה ההורדות והדירוג עוברים לשורת הפרטים, ו"פתח" נעלם: השם עצמו הוא הכפתור.
 *
 * @param {{ plugin: any, categoryNames: string[], selected: boolean, onSelect: (ids: string[], checked: boolean) => void,
 *   onOpen: (plugin: any) => void, onAssign: (plugin: any) => void, actions: Record<string, Function>, busy?: boolean }} props
 */
function StorePluginRow({ plugin, categoryNames, selected, onSelect, onOpen, onAssign, actions, busy = false }) {
  const state = storeState(plugin)
  const name = displayName(plugin)
  return (
    <li data-row={plugin._id} className={cx(STORE_ROW_GRID, ROW_PADDING, 'transition-colors', selected && 'bg-surface-selected')}>
      <div className={AREA_CHECK}>
        <Checkbox data-row-focus="" label={`בחר את ${name}`} checked={selected} onChange={(checked) => onSelect([plugin._id], checked)} />
      </div>
      <div className={AREA_THUMB}>
        <PluginThumb plugin={plugin} />
      </div>

      <div className={AREA_MAIN}>
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-title-sm text-on-surface">
          <button type="button" data-row-open="" aria-label={`פתח את ${name}`} onClick={() => onOpen(plugin)} className={ROW_NAME}>{name}</button>
          {state.short && <Badge tone="warning" icon="pause_circle">{state.short}</Badge>}
          {plugin.hasService && <Badge tone="info" className="@max-2xl:hidden">תוסף שירות</Badge>}
        </h3>
        <p className="mt-0.5 flex min-w-0 items-center gap-x-1 text-body-sm text-on-surface-variant">
          <bdi className="max-w-[60%] min-w-0 shrink-0 truncate">{plugin.author || plugin.authorId?.name || 'מפתח לא ידוע'}</bdi>
          <span aria-hidden="true">·</span>
          <Ltr className="shrink-0">{plugin.version}</Ltr>
          {categoryNames.length > 0 && (
            <span className="min-w-0 flex-1 truncate @max-2xl:hidden">
              <span aria-hidden="true">· </span>{categoryNames.join(', ')}
            </span>
          )}
        </p>
        <p className="whitespace-nowrap text-body-sm tabular-nums text-on-surface-variant @2xl:hidden">
          {downloadsText(plugin.downloadCount)}{plugin.ratingCount ? <> · <Rating plugin={plugin} /></> : null}
        </p>
      </div>

      <div className={cx(AREA_STATS, 'text-body-sm text-on-surface')}>
        <p className="tabular-nums">{downloadsText(plugin.downloadCount)}</p>
        <p><Rating plugin={plugin} /></p>
      </div>

      <div className={AREA_PRIMARY}>
        {/* למקלדת ולקורא מסך השם הוא הכפתור; "פתח" כאן רק כדי שיהיה ברור שאפשר */}
        <OpenChip decorative onClick={() => onOpen(plugin)} label={`פתח את ${name}`} className="@max-2xl:hidden" />
      </div>
      <div className={AREA_MENU}>
        <MenuButton label={`פעולות נוספות: ${name}`} items={storeMenuItems({ plugin, actions, onAssign, busy })} />
      </div>
    </li>
  )
}

export default memo(StorePluginRow)
