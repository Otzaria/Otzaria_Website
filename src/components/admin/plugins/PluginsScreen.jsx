'use client'

import { useCallback, useEffect, useState } from 'react'
import TabLinks from '@/components/ui/TabLinks'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import ServicePluginsAdmin from '@/components/admin/servicePlugins/ServicePluginsAdmin'
import { useServiceAdminData } from '@/components/admin/servicePlugins/useServiceAdminData'
import { serviceAttentionCount } from '@/components/admin/servicePlugins/servicePluginsAdminLogic'
import { unsavedConfirm, useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import PluginNotificationSettings from '@/components/notifications/PluginNotificationSettings'
import PluginApproveModal from '@/components/plugins/PluginApproveModal'
import PluginEditModal from '@/components/plugins/PluginEditModal'
import { PLUGIN_VIEWS, VIEW_LABELS, VIEW_SHORT_LABELS, parsePluginsQuery, sanitizePluginsQuery, serializePluginsQuery, updatePluginsQuery, viewHref } from '@/lib/adminPlugins/pluginsQuery'
import PluginsListView, { LIST_ID } from './PluginsListView'
import { PluginsListLoading } from './PluginsSkeleton'
import StoreLayoutView from './StoreLayoutView'
import { PLUGINS_TITLE, VIEW_DESCRIPTIONS } from './pluginsScreenText'
import { usePluginActions } from './usePluginActions'
import { usePluginsData } from './usePluginsData'
import { usePluginsQuery } from './usePluginsQuery'

const TITLE_ID = 'plugins-title'
const VIEW_ICONS = { pending: 'pending_actions', store: 'shop', layout: 'view_agenda', service: 'hub' }

/**
 * מסך התוספים (/library/admin/plugins) — ארבע תצוגות באותו עמוד, לפי ?view= (וכל אחת גם פריט בסרגל):
 *   לאישור — תור ההגשות החדשות והעדכונים (ברירת המחדל; גם ?tab=pending הישן)
 *   בחנות — התוספים שאושרו (?tab=approved הישן)
 *   סידור החנות — דף הבית של החנות: נבחרים, קטגוריות, לא משובצים (?tab=store הישן)
 *   תוספי שירות — ההגשות של תוספים עם שירות חיצוני (?tab=service הישן)
 * פרטי תוסף — במגירה (?plugin=…), במקום הכרטיס הארוך והחלונות הקופצים.
 * ההודעות הקופצות (useToast) מגיעות מהמעטפת (AdminShell), כך שהודעה עם "בטל" שורדת מעבר בין תצוגות.
 */
export default function PluginsScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [rawQuery, setQuery] = usePluginsQuery()
  const data = usePluginsData({
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const service = useServiceAdminData()
  const ready = data.status === 'ready'
  const categoryIds = data.categories ? data.categories.map((c) => c.id) : null
  const query = sanitizePluginsQuery(rawQuery, { categoryIds })
  const view = query.view
  const list = view === 'pending' || view === 'store'

  // כתובת ישנה (?tab=…) או ערך שנזרק — הכתובת מתוקנת למה שמוצג באמת
  // (מהכתובת עצמה, לא מ-query: רכיב ילד יכול היה לתקן אותה רגע לפני, ולא נחזיר את הערך הישן)
  const categoryKey = categoryIds?.join(',')
  useEffect(() => {
    const current = window.location.search
    const fixed = sanitizePluginsQuery(parsePluginsQuery(new URLSearchParams(current)), { categoryIds: categoryKey === undefined ? null : categoryKey.split(',') })
    if (current !== serializePluginsQuery(fixed) && (current.includes('tab=') || ready)) setQuery(fixed)
  }, [rawQuery, categoryKey, ready, setQuery])

  const [dialog, setDialog] = useState(null) // { kind: 'approve' | 'edit' | 'notifications', payload }
  // stillInStore — נדחה רק העדכון: מ"בחנות" המגירה נשארת פתוחה על אותו תוסף
  const onRemoved = useCallback((id, { stillInStore = false } = {}) => {
    if (stillInStore && rawQuery.view === 'store') return
    if (rawQuery.plugin === id) setQuery(updatePluginsQuery(rawQuery, { plugin: '', pane: '' }))
  }, [rawQuery, setQuery])
  const { actions, busy, bulkProgress, stopBulk } = usePluginActions({
    data,
    toast,
    confirm,
    openApprove: (plugin) => setDialog({ kind: 'approve', payload: plugin }),
    openEdit: (payload) => setDialog({ kind: 'edit', payload }),
    onRemoved,
  })

  // פעולה מרובה באמצע: יציאה מהמסך (קישור, "אחורה") שואלת, ו"עצור וצא" עוצר אותה; רענון / סגירה — אזהרת הדפדפן
  useBulkLeaveGuard({
    running: bulkProgress !== null,
    stop: stopBulk,
    drawerOpen: Boolean(rawQuery.plugin),
    confirm,
    body: 'הפעולה על התוספים שנבחרו עוד רצה. מה שכבר נשלח נשאר; מה שעוד לא נשלח — לא יישלח.',
  })

  // "סידור החנות" עם שינוי שלא נשמר — "לצאת בלי לשמור?" בכל קישור (לשוניות, סרגל, כותרת) וב"אחורה",
  // ואזהרת הדפדפן ברענון
  const [layoutDirty, setLayoutDirty] = useState(false)
  const { guardLeave } = useUnsavedChangesGuard(view === 'layout' && layoutDirty, () => confirm(unsavedConfirm('השינויים בסידור החנות לא נשמרו.')))

  // "רענן" — כל מה שעל המסך, גם "סידור החנות" (שמחזיק נתונים משלו). שינוי שלא נשמר — שואלים קודם
  const [layoutKey, setLayoutKey] = useState(0)
  const refreshAll = async () => {
    if (!(await guardLeave())) return
    setLayoutKey((key) => key + 1)
    const [updated] = await Promise.all([data.refresh(), service.reload()])
    if (updated) toast.show({ message: 'הנתונים עודכנו' })
  }

  const counts = {
    pending: ready ? data.pending.length : undefined,
    store: ready ? data.approved.length : undefined,
    layout: undefined,
    service: service.load.phase === 'ready' ? serviceAttentionCount(service.load.data.reviews) : undefined,
  }

  const menuItems = [
    { id: 'notifications', icon: 'notifications', label: 'הגדרות התראות', onSelect: () => setDialog({ kind: 'notifications' }) },
    { id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: refreshAll },
  ]

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader id={TITLE_ID} title={PLUGINS_TITLE} description={VIEW_DESCRIPTIONS[view]} menuItems={menuItems} menuLabel="הגדרות התוספים" />

      <TabLinks
        label="התצוגות של התוספים"
        activeId={view}
        items={PLUGIN_VIEWS.map((id) => ({ id, href: viewHref(id), label: VIEW_LABELS[id], shortLabel: VIEW_SHORT_LABELS[id], icon: VIEW_ICONS[id], count: counts[id], countOnPhone: id !== 'store' }))}
      />

      {list && data.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="sr-only">טוען את התוספים…</p>
          <PluginsListLoading view={view} />
        </div>
      )}
      {list && data.status === 'error' && (
        <LoadError
          error={data.error}
          title="לא הצלחנו לטעון את התוספים"
          sessionText="התחבר מחדש כדי לראות את התוספים. אחרי ההתחברות תחזור לכאן."
          onRetry={() => {
            document.getElementById(LIST_ID)?.focus({ preventScroll: true })
            data.retry()
          }}
        />
      )}
      {list && ready && (
        <PluginsListView
          key={view}
          mode={view}
          query={query}
          setQuery={setQuery}
          data={data}
          actions={actions}
          busy={busy}
          bulkProgress={bulkProgress}
          onStopBulk={stopBulk}
          toast={toast}
          titleId={TITLE_ID}
        />
      )}

      {view === 'layout' && (
        <StoreLayoutView
          key={layoutKey}
          toast={toast}
          confirm={confirm}
          approved={ready ? data.approved : null}
          approvedFailed={data.status === 'error'}
          onRetryApproved={data.retry}
          onDirtyChange={setLayoutDirty}
          onCategoriesChanged={data.refresh}
        />
      )}
      {view === 'service' && <ServicePluginsAdmin source={service} />}

      {confirmElement}

      {dialog?.kind === 'approve' && (
        <PluginApproveModal
          plugin={dialog.payload}
          onClose={() => setDialog(null)}
          onConfirm={async (selection) => {
            if (await actions.performApprove(dialog.payload, selection)) setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'edit' && (
        <PluginEditModal
          plugin={dialog.payload}
          endpoint={`/api/admin/plugins/${dialog.payload._id}/edit`}
          onClose={() => setDialog(null)}
          onSuccess={(result) => {
            setDialog(null)
            toast.show({ tone: 'success', message: result?.message || 'השינויים נשמרו.' })
            data.refresh()
          }}
        />
      )}
      {dialog?.kind === 'notifications' && <PluginNotificationSettings onClose={() => setDialog(null)} />}
    </div>
  )
}
