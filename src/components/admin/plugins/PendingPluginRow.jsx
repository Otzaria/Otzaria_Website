'use client'

import { memo } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import MenuButton from '@/components/ui/MenuButton'
import { cx } from '@/components/ui/cx'
import RelativeTime from '@/components/ui/RelativeTime'
import { reviewSource, submissionKind, submittedAt } from '@/lib/adminPlugins/pluginsQuery'
import { approveLabel, displayName, kindBadge, rejectLabel, stabilityBadge } from '@/lib/adminPlugins/pluginTerms'
import PluginThumb from './PluginThumb'
import PluginVersion from './PluginVersion'
import { pendingMenuItems } from './pluginRowActions'
import { AREA_MAIN, AREA_MENU, AREA_PRIMARY, AREA_THUMB, PENDING_ROW_GRID, ROW_NAME, ROW_PADDING } from './pluginRowLayout'
import OpenChip from '@/components/admin/list/OpenChip'

/**
 * שורה בתור "לאישור": תמונה, שם (ותג חדש / עדכון), שורת פרטים (מפתח · גרסה · מתי הוגש), והחלטה:
 * ברשימה רחבה — "אשר" ו"דחה" גלויים; ברשימה צרה — "פתח" (המגירה), וההחלטה ב-⋮.
 * לחיצה על השם פותחת את המגירה.
 *
 * @param {{ plugin: any, onOpen: (plugin: any) => void, actions: Record<string, Function>, busy?: boolean }} props
 */
function PendingPluginRow({ plugin, onOpen, actions, busy = false }) {
  const source = reviewSource(plugin)
  const update = submissionKind(plugin) === 'update'
  const stability = stabilityBadge(source.status)
  const name = source.name || displayName(plugin)
  const kind = kindBadge(plugin)
  return (
    <li data-row={plugin._id} className={cx(PENDING_ROW_GRID, ROW_PADDING)}>
      <div className={AREA_THUMB}>
        <PluginThumb plugin={plugin} pending />
      </div>

      <div className={AREA_MAIN}>
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-title-sm text-on-surface">
          <button type="button" data-row-open="" aria-label={`פתח את ${name}`} onClick={() => onOpen(plugin)} className={ROW_NAME}>{name}</button>
          <Badge tone={kind.tone}>{kind.label}</Badge>
          {stability && <Badge tone={stability.tone} className="@max-2xl:hidden">{stability.label}</Badge>}
        </h3>
        <p className="mt-0.5 truncate text-body-sm text-on-surface-variant">
          <bdi>{source.author || plugin.authorId?.name || 'מפתח לא ידוע'}</bdi>
        </p>
        <p className="flex items-center gap-x-1 text-body-sm text-on-surface-variant @max-2xl:flex-col @max-2xl:items-start">
          <PluginVersion plugin={plugin} />
          {submittedAt(plugin) && (
            <span className="whitespace-nowrap">
              <span aria-hidden="true" className="@max-2xl:hidden">· </span>
              <RelativeTime date={submittedAt(plugin)} prefix={submissionKind(plugin) === 'new' && plugin.isApproved ? 'אושר' : 'הוגש'} />
            </span>
          )}
        </p>
      </div>

      <div className={AREA_PRIMARY}>
        <span className="hidden gap-1 @2xl:flex">
          <Button variant="tonal" size="sm" icon="check" onClick={() => actions.approve(plugin)} disabled={busy} aria-label={`${approveLabel(plugin)}: ${name}`}>
            אשר
          </Button>
          <Button variant="text" size="sm" onClick={() => actions.reject(plugin)} disabled={busy} aria-label={`${rejectLabel(plugin)}: ${name}`}>
            {update ? 'דחה' : rejectLabel(plugin)}
          </Button>
        </span>
        <OpenChip decorative onClick={() => onOpen(plugin)} label={`פתח את ${name}`} className="@2xl:hidden" />
      </div>

      <div className={AREA_MENU}>
        <span className="hidden @2xl:block">
          <MenuButton label={`פעולות נוספות: ${name}`} items={pendingMenuItems({ plugin, actions, onOpen, busy })} />
        </span>
        <span className="@2xl:hidden">
          <MenuButton label={`פעולות: ${name}`} items={pendingMenuItems({ plugin, actions, onOpen, busy, withDecision: true })} />
        </span>
      </div>
    </li>
  )
}

export default memo(PendingPluginRow)
