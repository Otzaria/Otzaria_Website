'use client'

import { useId, useState } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import ErrorState from '@/components/ui/ErrorState'
import Pager from '@/components/ui/Pager'
import SelectMenu from '@/components/ui/SelectMenu'
import { useToast } from '@/components/ui/Toast'
import { fieldClasses } from '@/components/ui/fieldStyles'
import RelativeTime from '@/components/ui/RelativeTime'
import { bookOptions, statusLabel, statusOptions, totalAfterChange, totalText } from '@/lib/adminTzuratScreen/tzuratTerms'
import { apiCall, pageCount, pageImageUrl, query, withRegion } from './adminApi'
import { REPORT_CATEGORY } from './adminLabels'
import ActionError from '@/components/admin/list/ActionError'
import EmptyText from '@/components/ui/EmptyText'
import ErrorNotice from '@/components/ui/ErrorNotice'
import ListLoading from '@/components/ui/ListLoading'
import RefreshButton from '@/components/ui/RefreshButton'
import { FILTER_WIDTH, FilterSelect, StatusBadge, actionError } from './TzuratBits'
import useAdminData from './useAdminData'

// לשונית "דיווחים": דיווחים חופשיים של מתנדבים (בהגשה או מחוצה לה) לפי מצב, קטגוריה ומסכת; לכל דיווח — חיתוכי
// האזורים שסומנו בסריקה ובעמוד שלנו, הטקסט, המדווח וקישור לעמוד; שינוי מצב עם הערה — אותן בקשות כמו קודם:
// GET reports?status=&category=&slug=&page= ו-PATCH reports/[id] {status, note} → {report}. ("תוקן" מזכה את המדווח
// ב-2 נקודות — בשרת.) אחרי שמירה הכרטיס נשאר במקומו גם כשהמצב החדש כבר לא מתאים לסינון; "רענן" מסדר מחדש.
// הסה"כ והמונה בלשונית מתעדכנים מקומית (onChanged('report', מצב קודם, מצב חדש)) — בלי בקשה לשרת.

const STATUS_OPTIONS = statusOptions('report')
const CATEGORY_OPTIONS = Object.entries(REPORT_CATEGORY).map(([value, label]) => ({ value, label }))

const regionSrc = (r, g) => {
  const base = g.side === 'ours' ? r.oursUrl : r.scanUrl
  return base ? withRegion(base, g) : pageImageUrl(r.page, g.side, g)
}

function ReportCard({ report, onChange }) {
  const toast = useToast()
  const noteId = useId()
  const [status, setStatus] = useState(report.status)
  const [note, setNote] = useState(report.resolution?.note || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const title = `${report.masechet || report.slug} ${report.daf || ''}`.trim()

  const save = async () => {
    if (busy || !dirty) return
    setBusy(true)
    setError(null)
    const r = await apiCall(`reports/${encodeURIComponent(report.id)}`, { method: 'PATCH', body: { status, note }, failMessage: 'לא הצלחנו לשמור את הדיווח. נסה שוב.' })
    setBusy(false)
    if (!r.ok) return setError(actionError(r))
    onChange?.({ ...report, ...(r.data?.report || { status, resolution: { ...report.resolution, note } }) }, report.status)
    toast.show({ message: `הדיווח ב${title} נשמר: ${statusLabel('report', status)}` })
  }

  const dirty = status !== report.status || note !== (report.resolution?.note || '')

  return (
    <article className={cardClasses({ padding: 'md', className: 'flex min-w-0 flex-col gap-3 text-body-md' })} data-testid="admin-report" aria-label={`דיווח ${title}`}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-title-sm text-on-surface">{title}</h3>
            <StatusBadge kind="report" status={report.status} />
            <Badge>{REPORT_CATEGORY[report.category] || report.category}</Badge>
          </div>
          <p className="flex flex-wrap gap-x-2 text-body-sm text-on-surface-variant">
            <span className="min-w-0 [overflow-wrap:anywhere]">{report.userName}</span>
            {(report.createdAt || report.at) && <RelativeTime date={report.createdAt || report.at} prefix="·" />}
            {report.submission && <span>· בהגשה</span>}
          </p>
        </div>
        {report.page && (
          <Button variant="text" size="sm" iconEnd="open_in_new" href={`/library/tzurat-hadaf/review?page=${encodeURIComponent(report.page)}`} external
            aria-label={`פתח את העמוד ${title} (בלשונית חדשה)`}>
            פתח את העמוד
          </Button>
        )}
      </header>
      <p className="whitespace-pre-wrap break-words">{report.text}</p>
      {(report.regions || []).length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="אזורים שסומנו">
          {report.regions.map((g, i) => (
            <li key={i}>
              <figure className="flex flex-col items-center gap-1 rounded-(--radius-shape) bg-surface-container-lowest p-1">
                <img src={regionSrc(report, g)} alt={`${g.side === 'ours' ? 'העמוד שלנו' : 'הסריקה'} — אזור ${i + 1}`} loading="lazy" className="max-h-48 w-auto max-w-full" />
                <figcaption className="text-label-sm text-on-surface-variant">{g.side === 'ours' ? 'שלנו' : 'סריקה'}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          {/* "מצב" גלוי; לקורא המסך — שם ייחודי לכל כרטיס (ולא "מצב" שוב ושוב, כמו הבורר בסרגל) */}
          <span aria-hidden="true" className="mb-2 block text-label-md text-on-surface">מצב</span>
          <SelectMenu label={`מצב הדיווח ב${title}${report.userName ? ` של ${report.userName}` : ''}`} hideLabel options={STATUS_OPTIONS} value={status}
            onChange={(v) => v && setStatus(v)} highlight={status !== report.status} className="w-40" />
        </div>
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <label htmlFor={noteId} className="text-label-md text-on-surface-variant">
            הערה (המדווח יראה אותה)<span className="sr-only">{` — הדיווח ב${title}`}</span>
          </label>
          <input id={noteId} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={fieldClasses()} />
        </div>
        {/* softDisabled ולא disabled — אחרי השמירה הכפתור "כבוי" אבל הפוקוס נשאר עליו. ממולא רק כשיש מה לשמור —
            אחרת tonal, כדי שלא יהיו עשרה כפתורים ראשיים ברשימה */}
        <Button variant={dirty ? 'filled' : 'tonal'} onClick={save} softDisabled={!dirty || busy} aria-busy={busy || undefined} aria-label={`שמור את הדיווח ב${title}`}>
          {busy ? 'שומר…' : 'שמור'}
        </Button>
      </div>
      <ActionError error={error} />
    </article>
  )
}

/** @param {{ onChanged?: (kind: 'report', from: string, to: string) => void }} props */
export default function ReportsSection({ onChanged }) {
  const [status, setStatus] = useState('new')
  const [category, setCategory] = useState('all')
  const [slug, setSlug] = useState('all')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload: load, setData } = useAdminData(`reports${query({ status, category, slug, page })}`)
  const batches = useAdminData('batches').data
  // גודל הדף — לפי הדף הראשון, אם השרת אינו מחזיר pages
  const [firstSize, setFirstSize] = useState(0)
  if (page === 1 && data?.reports && data.reports.length !== firstSize) setFirstSize(data.reports.length)

  const filter = (setter) => (v) => {
    setter(v)
    setPage(1)
  }
  const replace = (rep, from) => {
    setData((d) => ({ ...d, total: totalAfterChange(d.total, status, from, rep.status), reports: d.reports.map((x) => (x.id === rep.id ? rep : x)) }))
    onChanged?.('report', from, rep.status)
  }
  const list = data?.reports || []
  const pages = pageCount(data, firstSize)

  return (
    <div className="flex flex-col gap-4" data-testid="reports">
      <div className="flex flex-wrap items-end gap-3">
        {/* בטלפון — שני בוררים בשורה ברוחב מלא (לא בחצי רוחב אחד מתחת לשני) */}
        <div className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto sm:flex-wrap">
          <FilterSelect label="מצב" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} allLabel="כל המצבים" className={FILTER_WIDTH} />
          <FilterSelect label="קטגוריה" value={category} onChange={filter(setCategory)} options={CATEGORY_OPTIONS} allLabel="כל הקטגוריות" className={FILTER_WIDTH} />
          <FilterSelect label="מסכת" value={slug} onChange={filter(setSlug)} options={bookOptions(batches)} allLabel="כל המסכתות" className={FILTER_WIDTH} />
        </div>
        <span className="flex-1" />
        {data && <span className="text-body-sm text-on-surface-variant" role="status">{totalText(data.total ?? list.length, 'דיווח אחד', 'דיווחים')}</span>}
        <RefreshButton onClick={load} busy={loading} />
      </div>
      {error && data && <ErrorNotice text={error} />}
      {error && !data ? (
        <ErrorState title="לא הצלחנו לטעון את הדיווחים" description={error} onRetry={load} />
      ) : !data ? (
        <ListLoading />
      ) : !list.length ? (
        <EmptyText>{status === 'new' ? 'אין דיווחים חדשים' : 'אין דיווחים כאלה'}</EmptyText>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((r) => <ReportCard key={r.id} report={r} onChange={replace} />)}
        </div>
      )}
      {pages > 1 && <Pager page={page} pageCount={pages} onChange={setPage} label="מעבר בין עמודי הדיווחים" className="self-center" />}
    </div>
  )
}
