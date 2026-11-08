'use client'

import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Ltr from '@/components/ui/Ltr'
import RelativeTime from '@/components/ui/RelativeTime'
import { reviewSource, submissionKind } from '@/lib/adminPlugins/pluginsQuery'
import { fileSizeText, sortedVersions } from '@/lib/adminPlugins/pluginTerms'
import { downloadHref } from './pluginRowActions'

/** "הורד": <a download> רגיל — בקשה אחת, ותשובת שגיאה לא מחליפה את המסך */
function DownloadButton({ href, label }) {
  return <Button variant="text" size="sm" icon="download" href={href} download="" aria-label={label}>הורד</Button>
}

/**
 * שורת גרסה. העמודות קבועות: "הורד" תמיד באותו מקום. deleteCell — false כשאין ברשימה מחיקה בכלל;
 * אחרת תא באותו רוחב, גם בשורות שאין בהן מה למחוק.
 */
function VersionRow({ title, badge, meta, download, deleteCell = false, onDelete, deleteLabel, busy }) {
  return (
    <li className="flex items-center gap-x-1 ps-3 pe-1 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-title-sm text-on-surface">{title}{badge}</p>
        {meta && <p className="text-body-sm text-on-surface-variant">{meta}</p>}
      </div>
      {download}
      {deleteCell && (onDelete ? (
        <Button variant="text" size="sm" icon="delete" iconOnly onClick={onDelete} disabled={busy} aria-label={deleteLabel} className="text-on-surface-variant hover:text-error" />
      ) : (
        <span aria-hidden="true" className="size-(--touch-target) shrink-0" />
      ))}
    </li>
  )
}

/**
 * לשונית "גרסאות": הגרסה שהוגשה (כשיש עדכון שממתין), הגרסה הנוכחית, והגרסאות הקודמות — מהחדשה לישנה.
 * לכל גרסה "הורד"; לגרסה קודמת גם מחיקה שקטה (חלון אישור — אי אפשר לשחזר). בתוסף שירות השרת חוסם מחיקת
 * גרסה, ולכן הכפתור לא מוצג. התג "בחנות" — רק כשהתוסף באמת בחנות.
 * @param {{ plugin: any, actions: Record<string, Function>, busy: boolean }} props
 */
export default function PluginVersionsPane({ plugin, actions, busy }) {
  const waiting = Boolean(plugin.pendingUpdate)
  const inStore = plugin.isApproved === true
  const older = sortedVersions(plugin)
  const deleteCell = older.length > 0 && !plugin.hasService
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-outline-variant/60 rounded-(--radius-control) bg-surface">
        {waiting && (
          <VersionRow
            title={<>גרסה <Ltr>{reviewSource(plugin).version}</Ltr></>}
            badge={<Badge tone="warning">ממתין לאישור</Badge>}
            meta={fileSizeText(reviewSource(plugin).pluginFileSize) || null}
            download={<DownloadButton href={downloadHref(plugin, { pending: true })} label={`הורד את גרסה ${reviewSource(plugin).version}`} />}
            deleteCell={deleteCell}
          />
        )}
        <VersionRow
          title={<>גרסה <Ltr>{plugin.version}</Ltr></>}
          badge={inStore ? <Badge tone="success">בחנות</Badge> : <Badge tone="warning">{submissionKind(plugin) === 'new' ? 'ממתין לאישור' : 'לא בחנות'}</Badge>}
          meta={fileSizeText(plugin.pluginFileSize) || null}
          download={<DownloadButton href={downloadHref(plugin)} label={`הורד את גרסה ${plugin.version}`} />}
          deleteCell={deleteCell}
        />
        {older.map((v) => (
          <VersionRow
            key={v.version}
            title={<>גרסה <Ltr>{v.version}</Ltr></>}
            meta={<><RelativeTime date={v.archivedAt} prefix="הוחלפה" />{fileSizeText(v.pluginFileSize) ? ` · ${fileSizeText(v.pluginFileSize)}` : ''}</>}
            download={<DownloadButton href={`/api/plugins/${plugin._id}@${encodeURIComponent(v.version)}/download`} label={`הורד את גרסה ${v.version}`} />}
            deleteCell={deleteCell}
            onDelete={plugin.hasService ? undefined : () => actions.deleteVersion(plugin, v.version)}
            deleteLabel={`מחק את גרסה ${v.version}`}
            busy={busy}
          />
        ))}
      </ul>
      {older.length === 0 && (
        <EmptyState tone="plain" icon="history" title="אין גרסאות קודמות" description="כשמאשרים גרסה חדשה, הגרסה הקודמת נשמרת כאן." as="h3" />
      )}
    </div>
  )
}
