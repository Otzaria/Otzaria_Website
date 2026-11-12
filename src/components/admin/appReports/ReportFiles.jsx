'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { AdminApiError, errorMessage, loginHref, send, serverError } from '@/components/admin/list/adminRequest'
import { formatBytes, reportFiles } from '@/lib/adminAppReportsScreen/appReportsTerms'

/** תמונות מצורפות — ממוזערות, וכל אחת נפתחת בלשונית חדשה */
export function ReportImages({ images, urlFor, title = 'צילומי מסך' }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-title-sm text-on-surface">{title} ({images.length})</h3>
      <ul className="flex flex-wrap gap-3">
        {images.map((img, i) => {
          const url = urlFor(i)
          return (
            <li key={i}>
              <a href={url} target="_blank" rel="noopener noreferrer" title={`${img.fileName} (${formatBytes(img.size)})`}
                className="block overflow-hidden rounded-(--radius-shape) bg-surface-container-lowest">
                <img src={url} alt={img.fileName} loading="lazy" className="h-40 w-auto max-w-xs object-contain" />
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const DIAGNOSTICS_FAILED = 'לא הצלחנו לטעון את האבחון.'

/** קובץ האבחון כטקסט: GET (דרך send — הפניה לדף ההתחברות / 401 נזרקות); שגיאה או דף HTML — לא מוצגים כאבחון */
export async function loadDiagnostics(url) {
  const res = await send(url)
  const type = res.headers?.get?.('content-type') || ''
  if (!res.ok) {
    const data = type.includes('application/json') ? await res.json().catch(() => null) : null
    throw new AdminApiError(errorMessage(res.status, DIAGNOSTICS_FAILED, serverError(data)), res.status)
  }
  if (type.includes('text/html')) throw new AdminApiError(DIAGNOSTICS_FAILED, res.status)
  const raw = await res.text()
  try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
}

/**
 * קובץ האבחון בתוך העמוד — נטען רק כשפותחים (GET לאותה כתובת ההורדה, כמו קודם). כישלון — הודעה בעברית מחוץ
 * לתיבה, עם "נסה שוב" (או "התחבר" כשההתחברות פגה); פתיחה מחדש אחרי כישלון — טוענת שוב.
 */
function DiagnosticsViewer({ url }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      setText(await loadDiagnostics(url))
    } catch (err) {
      setError({ message: err?.message || DIAGNOSTICS_FAILED, sessionExpired: Boolean(err?.sessionExpired) })
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !text) load()
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button variant="text" size="sm" icon={open ? 'expand_less' : 'expand_more'} onClick={toggle} aria-expanded={open}>
          {open ? 'הסתר את האבחון' : 'הצג את האבחון'}
        </Button>
      </div>
      {open && error && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-error">
          <span>{error.message}</span>
          {error.sessionExpired
            ? <Button href={loginHref()} variant="text" size="sm" icon="login">התחבר</Button>
            : <Button variant="text" size="sm" icon="refresh" onClick={load}>נסה שוב</Button>}
        </div>
      )}
      {open && !error && (
        <pre dir="ltr" aria-busy={loading || undefined} className="max-h-[600px] overflow-auto rounded-(--radius-shape) bg-surface-container-lowest p-3 text-start text-body-sm">
          {text || <span dir="rtl">טוען…</span>}
        </pre>
      )}
    </div>
  )
}

/** "קבצים": הורדה של מה שצורף (אבחון, שגיאות, קובץ קריסה), צילומי המסך והצגת האבחון */
export default function ReportFiles({ report }) {
  const base = `/api/app-reports/admin/${encodeURIComponent(report.reportId)}`
  const files = reportFiles(report)
  const images = report.files?.images || []
  if (files.length === 0 && images.length === 0) return <p className="text-body-md text-on-surface-variant">לא צורפו קבצים.</p>
  return (
    <div className="flex flex-col gap-4">
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.kind}>
              <Button variant="tonal" size="sm" icon="download" href={`${base}/files/${f.kind}`} title={f.hint}>
                <bdi dir="ltr">{f.name}</bdi> (<bdi dir="ltr">{formatBytes(f.size)}</bdi>)
              </Button>
            </li>
          ))}
        </ul>
      )}
      {images.length > 0 && <ReportImages images={images} urlFor={(i) => `${base}/images/${i}`} />}
      {report.files?.diagnostics && <DiagnosticsViewer url={`${base}/files/diagnostics`} />}
    </div>
  )
}
