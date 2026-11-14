'use client'

import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Ltr from '@/components/ui/Ltr'
import Tabs, { tabPanelProps } from '@/components/ui/Tabs'
import { reviewSource } from '@/lib/adminPlugins/pluginsQuery'
import { approveLabel, displayName, kindBadge, rejectLabel, storeState } from '@/lib/adminPlugins/pluginTerms'
import PluginAssignPane from './PluginAssignPane'
import PluginOverviewPane from './PluginOverviewPane'
import PluginRatingsPane from './PluginRatingsPane'
import PluginThumb from './PluginThumb'
import PluginVersion from './PluginVersion'
import PluginVersionsPane from './PluginVersionsPane'

const TAB_PREFIX = 'plugin-drawer'

/**
 * הלשוניות לפי התוסף: "שיבוץ" — רק לתוסף שכבר בחנות (גם כשיש לו עדכון שממתין); "דירוגים" — גם לתוסף שהוחזר
 * להמתנה (מי שעומד למחוק אותו צריך לראות מה יימחק).
 */
export function drawerPanes(plugin) {
  const inStore = plugin?.isApproved === true
  return [
    { id: 'overview', label: 'סקירה' },
    { id: 'versions', label: 'גרסאות' },
    ...(inStore || plugin?.ratingCount > 0 ? [{ id: 'ratings', label: 'דירוגים' }] : []),
    ...(inStore ? [{ id: 'assign', label: 'שיבוץ' }] : []),
  ]
}

/**
 * מגירת התוסף — במקום החלונות הקופצים (דירוגים, ערוך שיבוץ) והכרטיס הארוך: כל מה שעושים על תוסף
 * אחד, בלשוניות. הכתובת (?plugin=…&pane=…) אומרת מה פתוח, כך שקישור ישיר עובד ו"אחורה" סוגר.
 * mode — pending (מהתור "לאישור": רואים את מה שהוגש) / store (מ"בחנות").
 * ב"לאישור" ההחלטה קבועה בתחתית המגירה: "אשר" תמיד נראה, בכל לשונית ובלי לגלול, גם למי שבדיוק הוריד גרסה
 * לבדיקה ב"גרסאות". פעולה ראשית אחת בולטת, ו"דחה" בקצה השני ובאדום. ב"בחנות" אין פעולה דחופה — הן בסקירה.
 *
 * @param {{ plugin: any, mode: 'pending' | 'store', pane: string, onPane: (pane: string) => void, onClose: () => void,
 *   actions: Record<string, Function>, busy: boolean, toast: any, categories: any[] | null,
 *   onCategory: (category: any) => void, onAggregate: (aggregate: any) => void, returnFocus?: () => HTMLElement | null }} props
 */
export default function PluginDrawer({ plugin, mode, pane, onPane, onClose, actions, busy, toast, categories, onCategory, onAggregate, returnFocus }) {
  const panes = drawerPanes(plugin)
  const current = panes.some((p) => p.id === pane) ? pane : 'overview'
  const pending = mode === 'pending'
  const source = pending ? reviewSource(plugin) : plugin
  const state = storeState(plugin)
  const name = source.name || displayName(plugin)
  const kind = kindBadge(plugin)
  const version = pending ? <PluginVersion plugin={plugin} /> : plugin.version && <>גרסה <Ltr>{plugin.version}</Ltr></>

  return (
    <Drawer
      title={name}
      subtitle={(
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span><bdi>{source.author || 'מפתח לא ידוע'}</bdi>{reviewSource(plugin).version || plugin.version ? <> · {version}</> : null}</span>
          {pending && <Badge tone={kind.tone}>{kind.label}</Badge>}
          {!pending && state.short && <Badge tone="warning" icon="pause_circle">{state.label}</Badge>}
        </span>
      )}
      leading={<PluginThumb plugin={plugin} pending={pending} size="lg" className="mt-1" />}
      onClose={onClose}
      returnFocus={returnFocus}
      footer={pending ? (
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="filled" size="sm" icon="check" onClick={() => actions.approve(plugin)} disabled={busy}>{approveLabel(plugin)}</Button>
          <Button variant="text" size="sm" onClick={() => actions.reject(plugin)} disabled={busy} className="text-error">{rejectLabel(plugin)}</Button>
        </div>
      ) : undefined}
      header={<Tabs label={`הלשוניות של ${name}`} idPrefix={TAB_PREFIX} items={panes} value={current} onChange={onPane} className="px-2 sm:px-4" />}
    >
      <div {...tabPanelProps(TAB_PREFIX, current)} className="outline-none">
        {current === 'overview' && (
          <PluginOverviewPane plugin={plugin} mode={mode} actions={actions} busy={busy} onAssign={pending ? undefined : () => onPane('assign')} />
        )}
        {current === 'versions' && <PluginVersionsPane plugin={plugin} actions={actions} busy={busy} />}
        {current === 'ratings' && <PluginRatingsPane plugin={plugin} toast={toast} onAggregate={onAggregate} />}
        {current === 'assign' && <PluginAssignPane plugin={plugin} categories={categories} toast={toast} onCategory={onCategory} />}
      </div>
    </Drawer>
  )
}
