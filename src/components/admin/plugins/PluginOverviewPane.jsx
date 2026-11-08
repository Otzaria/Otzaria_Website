'use client'

import { useId, useState } from 'react'
import ActionList from '@/components/ui/ActionList'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import { cx } from '@/components/ui/cx'
import RelativeTime from '@/components/ui/RelativeTime'
import { reviewSource, submissionKind, submittedAt } from '@/lib/adminPlugins/pluginsQuery'
import { downloadsText, fileSizeText, ratingText, rejectNote, stabilityBadge, storeState } from '@/lib/adminPlugins/pluginTerms'
import { downloadHref, startDownload, storeMenuItems } from './pluginRowActions'

const DT = 'text-label-md text-on-surface-variant'
const DD = 'min-w-0 text-body-md text-on-surface [overflow-wrap:anywhere]'
/** מעל זה התיאור המלא מתקצר ל-6 שורות: בתיאור ארוך הוא דחק את הפרטים מסכים למטה */
const LONG_TEXT = 400

/** ערך לועזי בשורת פרטים: בידוד כיוון כמו ui/Ltr, אבל נשבר — כתובת או שם קובץ ארוכים לא מרחיבים את המגירה */
function LtrValue({ children }) {
  return <bdi dir="ltr" className="[overflow-wrap:anywhere]">{children}</bdi>
}

function Screenshot({ src, index, count }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className="flex h-36 w-48 flex-col items-center justify-center gap-1 rounded-(--radius-control) bg-surface-container-high text-body-sm text-on-surface-variant">
        <AppIcon name="image" className="text-icon-xl" />
        לא נטען
      </span>
    )
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-(--radius-control) bg-surface-container-high">
      <img src={src} alt={`צילום מסך ${index + 1} מתוך ${count}`} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-36 w-auto max-w-64 object-cover" />
    </a>
  )
}

/** צילומי המסך — פס נגלל; לחיצה פותחת את התמונה בגודל מלא בלשונית חדשה. תמונה שלא נטענה — אריח באותו גובה */
function Screenshots({ plugin, pending, labelledBy }) {
  const source = pending ? reviewSource(plugin) : plugin
  const count = source.screenshots?.length || 0
  if (count === 0) return <p className="text-body-md text-on-surface-variant">אין צילומי מסך.</p>
  const usePending = pending && Boolean(plugin.pendingUpdate)
  return (
    <ul aria-labelledby={labelledBy} className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="shrink-0">
          <Screenshot src={`/api/plugins/${plugin._id}/screenshots/${i}${usePending ? '?pending=1' : ''}`} index={i} count={count} />
        </li>
      ))}
    </ul>
  )
}

/** מה השתנה בעדכון — "לפני" ו"אחרי" לכל שדה שהמפתח שינה */
function Changes({ changes, labelledBy }) {
  return (
    <dl aria-labelledby={labelledBy} className="flex flex-col divide-y divide-outline-variant/60 rounded-(--radius-control) bg-surface">
      {changes.map((change, i) => (
        <div key={`${change.field}-${i}`} className="flex flex-col gap-1 p-3">
          <dt className="text-label-lg text-on-surface">{change.label}</dt>
          <dd className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-body-sm">
            <span className="text-on-surface-variant">לפני</span>
            <span className="text-on-surface-variant [overflow-wrap:anywhere]" dir="auto">{change.before || '—'}</span>
            <span className="text-on-surface-variant">אחרי</span>
            <span className="text-on-surface [overflow-wrap:anywhere]" dir="auto">{change.after || '—'}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** תיאור מלא: ארוך — 6 שורות ו"הצג הכול" */
function LongText({ text }) {
  const [open, setOpen] = useState(false)
  const long = text.length > LONG_TEXT
  return (
    <>
      <p className={cx('whitespace-pre-wrap text-body-sm text-on-surface-variant [overflow-wrap:anywhere]', long && !open && 'line-clamp-6')} dir="auto">{text}</p>
      {long && (
        <Button variant="text" size="sm" aria-expanded={open} className="self-start" onClick={() => setOpen((v) => !v)}>
          {open ? 'הצג פחות' : 'הצג הכול'}
        </Button>
      )}
    </>
  )
}

/**
 * לשונית "סקירה" במגירת התוסף: מה השתנה (בעדכון), צילומי מסך, תיאור, פרטים — ופעולות.
 * "לאישור": "אשר" ו"דחה" בתחתית המגירה (PluginDrawer), נראים בכל לשונית; כאן "הורד לבדיקה" ומה "דחה" ימחק.
 * "בחנות": "פתח בחנות", רשימת הפעולות השקטה (כמו ב-⋮), ואחרונה — "מחק לצמיתות".
 *
 * @param {{ plugin: any, mode: 'pending' | 'store', actions: Record<string, Function>, busy: boolean,
 *   onAssign?: () => void }} props
 */
export default function PluginOverviewPane({ plugin, mode, actions, busy, onAssign }) {
  const pending = mode === 'pending'
  const source = pending ? reviewSource(plugin) : plugin
  const kind = pending ? submissionKind(plugin) : null
  const update = kind === 'update'
  const ids = { changes: useId(), shots: useId(), about: useId(), meta: useId(), actions: useId(), danger: useId() }
  const stability = stabilityBadge(source.status)
  const state = storeState(plugin)
  const shots = source.screenshots?.length || 0
  const fileName = source.pluginFileName || plugin.pluginFileName
  const fileSize = fileSizeText(source.pluginFileSize)
  const storeItems = pending ? [] : storeMenuItems({ plugin, actions, onAssign, busy })
  const deleteIndex = storeItems.findIndex((i) => i.id === 'delete')
  const mainItems = storeItems.slice(0, Math.max(0, deleteIndex - 1))
  const dangerItems = storeItems.slice(deleteIndex)

  return (
    <div className="flex flex-col gap-6">
      {kind === 'returned' && (
        <p role="note" className="rounded-(--radius-control) bg-warning-container px-4 py-3 text-body-sm text-on-warning-container">
          התוסף הוחזר להמתנה והוא לא בחנות. {rejectNote(plugin)} אי אפשר לשחזר.
        </p>
      )}

      {plugin.pendingUpdate && pending && plugin.pendingChangeSummary?.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 id={ids.changes} className="text-title-sm text-on-surface">מה השתנה</h3>
          <Changes changes={plugin.pendingChangeSummary} labelledBy={ids.changes} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 id={ids.shots} className="text-title-sm text-on-surface">צילומי מסך{shots > 0 ? ` (${shots})` : ''}</h3>
        <Screenshots plugin={plugin} pending={pending} labelledBy={ids.shots} />
      </section>

      {(source.shortDescription || source.description) && (
        <section aria-labelledby={ids.about} className="flex flex-col gap-2">
          <h3 id={ids.about} className="text-title-sm text-on-surface">תיאור</h3>
          {source.shortDescription && <p className="text-body-md text-on-surface [overflow-wrap:anywhere]" dir="auto">{source.shortDescription}</p>}
          {source.description && source.description !== source.shortDescription && <LongText text={source.description} />}
        </section>
      )}

      <section aria-labelledby={ids.meta} className="flex flex-col gap-3">
        <h3 id={ids.meta} className="text-title-sm text-on-surface">פרטים</h3>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-6 gap-y-3">
          <dt className={DT}>מפתח</dt>
          <dd className={DD}><bdi>{source.author || '—'}</bdi></dd>
          <dt className={DT}>הועלה על ידי</dt>
          <dd className={DD}>
            <bdi>{plugin.lastSubmittedBy?.name || plugin.authorId?.name || 'לא ידוע'}</bdi>
            {(plugin.lastSubmittedBy?.email || plugin.authorId?.email) && (
              <span className="block text-body-sm text-on-surface-variant"><LtrValue>{plugin.lastSubmittedBy?.email || plugin.authorId?.email}</LtrValue></span>
            )}
          </dd>
          <dt className={DT}>גרסה</dt>
          <dd className={DD}>
            {source.version ? <LtrValue>{source.version}</LtrValue> : '—'}
            {stability && <span className="text-on-surface-variant"> · {stability.label}</span>}
          </dd>
          <dt className={DT}>מתאים לאוצריא</dt>
          <dd className={DD}>
            <LtrValue>{source.compatibleWith || '—'}</LtrValue>
            {source.maxAppVersion && <span className="text-on-surface-variant"> · עד <LtrValue>{source.maxAppVersion}</LtrValue></span>}
          </dd>
          {source.requiresNetwork && (
            <>
              <dt className={DT}>אינטרנט</dt>
              <dd className={DD}>צריך חיבור לאינטרנט</dd>
            </>
          )}
          {plugin.hasService && (
            <>
              <dt className={DT}>שירות</dt>
              <dd className={DD}>תוסף שירות — עובד מול שרת חיצוני</dd>
            </>
          )}
          {pending ? (
            <>
              <dt className={DT}>{update ? 'עדכון הוגש' : 'הוגש'}</dt>
              <dd className={DD}><RelativeTime date={submittedAt(plugin)} /></dd>
            </>
          ) : (
            <>
              <dt className={DT}>מצב</dt>
              <dd className={DD}>{state.label}</dd>
              <dt className={DT}>הורדות</dt>
              <dd className={DD}>{downloadsText(plugin.downloadCount)}</dd>
              <dt className={DT}>דירוג</dt>
              <dd className={DD}>{ratingText(plugin)}</dd>
              {plugin.approvedAt && (
                <>
                  <dt className={DT}>אושר</dt>
                  <dd className={DD}><RelativeTime date={plugin.approvedAt} />{plugin.approvedBy?.name && <> · <bdi>{plugin.approvedBy.name}</bdi></>}</dd>
                </>
              )}
            </>
          )}
          <dt className={DT}>קובץ</dt>
          <dd className={DD}>
            {fileName ? <LtrValue>{fileName}</LtrValue> : '—'}
            {fileSize && <span className="block text-body-sm text-on-surface-variant">{fileSize}</span>}
          </dd>
          {source.tags?.length > 0 && (
            <>
              <dt className={DT}>תגיות</dt>
              <dd className={DD}>{source.tags.join(', ')}</dd>
            </>
          )}
          {source.homepage && (
            <>
              <dt className={DT}>אתר</dt>
              <dd className={DD}>
                <a href={source.homepage} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2"><LtrValue>{source.homepage}</LtrValue></a>
              </dd>
            </>
          )}
        </dl>
      </section>

      {pending ? (
        <section aria-labelledby={ids.actions} className="flex flex-col gap-2">
          <h3 id={ids.actions} className="text-title-sm text-on-surface">פעולות</h3>
          <ActionList label={`פעולות על ${source.name}`} items={[{ id: 'download', icon: 'download', label: 'הורד לבדיקה', onSelect: () => startDownload(downloadHref(plugin, { pending: true })) }]} />
          <p className="px-3 text-body-sm text-on-surface-variant">{rejectNote(plugin)}</p>
        </section>
      ) : (
        <>
          <section aria-labelledby={ids.actions} className="flex flex-col gap-3">
            <h3 id={ids.actions} className="text-title-sm text-on-surface">פעולות</h3>
            <Button variant="tonal" size="sm" icon="open_in_new" href={`/plugins/${plugin._id}`} fullWidth>פתח בחנות</Button>
            <ActionList label={`פעולות על ${plugin.name}`} items={mainItems} />
          </section>
          <section aria-labelledby={ids.danger} className="flex flex-col gap-2">
            <h3 id={ids.danger} className="sr-only">מחיקה</h3>
            <ActionList label="מחיקה" items={dangerItems} />
            <p className="px-3 text-body-sm text-on-surface-variant">
              {plugin.pendingUpdate
                ? 'יש עדכון שממתין לאישור: הפעולה מוחקת רק אותו, והתוסף נשאר בחנות. למחיקת התוסף — קודם דחה את העדכון.'
                : 'מחיקה מוחקת את התוסף, את הקבצים ואת כל הגרסאות. אי אפשר לשחזר.'}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
