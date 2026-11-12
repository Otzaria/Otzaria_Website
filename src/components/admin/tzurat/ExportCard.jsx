'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { AdminApiError, saveBlob, send } from '@/components/admin/list/adminRequest'
import { EXPORT_TYPES, exportFileName, exportUrl as buildExportUrl, sizeText } from '@/lib/adminTzuratScreen/tzuratTerms'
import { API, apiCall, replyError } from './adminApi'
import CheckRow from '@/components/ui/CheckRow'
import ErrorNotice from '@/components/ui/ErrorNotice'
import CardSection from '@/components/ui/CardSection'

// לשונית "הורדות" (לשעבר "ייצוא"): הקובץ לכלי של צורת הדף — אותן בקשות כמו קודם: GET export?since=&types= (NDJSON:
// ההכרעות, העוגנים, התיקונים הידניים, "מבט כללי", הדיווחים והתורמים), ואחריו POST export {exportId} — אישור קבלה.
// "הורד את הקובץ" — הפעולה הראשית; "הורד מאז התאריך" — רק מה שהשתנה מתאריך.
// השליחה דרך send המשותף: הפניה לדף ההתחברות או קובץ לא תקין — שגיאה בעברית, ולא קובץ HTML שנשמר בטעות.

export { EXPORT_TYPES }
/** כתובת ההורדה (נשאר כאן בשביל הטסטים הקיימים) */
export const exportUrl = (since, types) => buildExportUrl(API, since, types)

/** הקובץ יכול להיות גדול — תקרת זמן ארוכה יותר מהרגילה */
const EXPORT_TIMEOUT_MS = 5 * 60 * 1000
const BAD_FILE = 'הקובץ שהתקבל מהשרת לא תקין. נסה שוב.'

export default function ExportCard() {
  const toast = useToast()
  const sinceId = useId()
  const [since, setSince] = useState('')
  const [types, setTypes] = useState(() => EXPORT_TYPES.map(([k]) => k))
  const [busy, setBusy] = useState(null) // 'all' | 'since' | null
  const [error, setError] = useState(null)

  const toggle = (k) => setTypes((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : EXPORT_TYPES.map(([x]) => x).filter((x) => x === k || cur.includes(x))))

  const download = async (useSince) => {
    if (busy) return
    setBusy(useSince ? 'since' : 'all')
    setError(null)
    try {
      const res = await send(exportUrl(useSince ? since : '', types), { cache: 'no-store', timeoutMs: EXPORT_TIMEOUT_MS })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new AdminApiError(replyError(res.status, d, `ההורדה נכשלה (${res.status})`), res.status)
      }
      const blob = await res.blob()
      const firstLine = (await blob.slice(0, Math.min(blob.size, 8192)).text()).split('\n', 1)[0]
      let meta
      try {
        meta = JSON.parse(firstLine)
      } catch {
        throw new AdminApiError(BAD_FILE, res.status)
      }
      if (meta?.exportId) {
        const ack = await apiCall('export', { method: 'POST', body: { exportId: meta.exportId } })
        if (!ack.ok) throw new AdminApiError(ack.sessionExpired ? ack.error : 'הקובץ התקבל, אך אישור הקבלה נכשל; אפשר להוריד שוב בבטחה', ack.status)
      }
      saveBlob(blob, exportFileName(new Date().toISOString().slice(0, 10), useSince ? since : ''))
      toast.show({ message: `הקובץ הורד (${sizeText(blob.size)})` })
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'ההורדה נכשלה. בדוק את החיבור ונסה שוב.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <CardSection
      title="הורדה לכלי של צורת הדף"
      testId="export-card"
      description={(
        <>
          קובץ אחד עם כל מה שהוחלט באתר: רק החלטות שהוסכמו או הוכרעו, וסימוני שורות מהגשות שאושרו. הכלי של צורת הדף
          קורא את הקובץ הזה.
        </>
      )}
    >
      <fieldset className="flex flex-col">
        <legend className={FIELD_LABEL}>מה להוריד</legend>
        {EXPORT_TYPES.map(([k, label, hint]) => (
          <CheckRow key={k} checked={types.includes(k)} onChange={() => toggle(k)}>
            {label}
            {hint && <span className="block text-body-sm text-on-surface-variant">{hint}</span>}
          </CheckRow>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <Button icon="download" onClick={() => download(false)} disabled={!types.length || (!!busy && busy !== 'all')} loading={busy === 'all'}>
          הורד את הקובץ
        </Button>
        <span className="flex-1" />
        <div className="flex flex-col gap-1">
          <label htmlFor={sinceId} className="text-label-md text-on-surface-variant">רק מה שהשתנה מאז תאריך</label>
          <input id={sinceId} type="date" value={since} onChange={(e) => setSince(e.target.value)} className={fieldClasses({ className: 'w-44' })} />
        </div>
        <Button variant="outlined" icon="download" onClick={() => download(true)} disabled={!since || !types.length || (!!busy && busy !== 'since')} loading={busy === 'since'}>
          הורד מאז התאריך
        </Button>
      </div>
      <ErrorNotice text={error} />
    </CardSection>
  )
}
