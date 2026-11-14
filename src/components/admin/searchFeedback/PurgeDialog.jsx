'use client'

import { useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import CheckRow from '@/components/ui/CheckRow'
import Dialog from '@/components/ui/Dialog'
import { FIELD_LABEL_COMPACT, fieldClasses } from '@/components/ui/fieldStyles'
import { formatNumber, fullDateText } from '@/lib/adminTerms'
import { loginHref, requestJson } from '@/components/admin/list/adminRequest'
import EventFilters from './EventFilters'
import { EMPTY_FILTERS, filtersToCriteria } from './labels'

const PURGE_URL = '/api/search-feedback/admin/purge'

/** אותה בקשה כמו קודם (POST, גוף JSON); requestJson — התחברות שפגה / שבת / תשובה שאינה JSON הן שגיאה בעברית */
function postPurge(body, dryRun) {
  return requestJson(dryRun ? `${PURGE_URL}?dryRun=1` : PURGE_URL, {
    method: 'POST',
    body,
    fallback: dryRun ? 'לא הצלחנו לבדוק כמה יימחקו.' : 'הניקוי נכשל. לא נמחק דבר.',
  })
}

/**
 * "נקה משוב" (מתפריט ⋮ של הכותרת) — מחיקה לצמיתות: בוחרים מה למחוק, "בדוק כמה יימחקו" (POST ?dryRun=1), מקלידים את
 * המספר, ו"מחק לצמיתות" (אותן בקשות ואותו גוף כמו קודם). ההקלדה היא האישור — בלי חלון אישור נוסף של הדפדפן.
 * כל שינוי במה שנבחר מבטל את הבדיקה; תשובה של בדיקה ישנה (שהגיעה אחרי שינוי) לא מוצגת.
 * onPurged(deleted) — אחרי מחיקה מוצלחת (המסך סוגר, מודיע ומרענן).
 * בזמן בקשה (phase: 'preview' / 'purge') כל השדות נעולים, כך שמה שנשלח הוא מה שמוצג, והכפתורים "כבויים" ב-softDisabled
 * (הפוקוס לא נזרק לגוף הדף).
 */
export default function PurgeDialog({ models, onPurged, onClose }) {
  const ids = { key: useId(), count: useId() }
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [keyId, setKeyId] = useState('')
  const [all, setAll] = useState(false)
  const [preview, setPreview] = useState(null)
  const [typedCount, setTypedCount] = useState('')
  const [phase, setPhase] = useState(null)
  const busy = phase !== null
  const [error, setError] = useState(null)
  const revision = useRef(0)
  const previousPreviewId = useRef(null)

  const criteria = () => {
    if (all) return { all: true }
    const c = filtersToCriteria(filters, models)
    if (keyId.trim()) c.keyId = keyId.trim()
    return c
  }
  const resetPreview = () => {
    revision.current += 1
    setPreview(null)
    setTypedCount('')
    setError(null)
  }

  const runPreview = async () => {
    if (busy) return
    setPhase('preview')
    resetPreview()
    const requestedRevision = revision.current
    const requestedCriteria = criteria()
    try {
      const json = await postPurge({ ...requestedCriteria, ...(previousPreviewId.current ? { replacePreviewId: previousPreviewId.current } : {}) }, true)
      previousPreviewId.current = json.previewId || null
      if (revision.current === requestedRevision) {
        setPreview({ count: json.count, asOf: json.asOf, previewId: json.previewId, criteria: requestedCriteria })
      }
    } catch (err) {
      if (revision.current === requestedRevision) setError(err)
    } finally {
      setPhase(null)
    }
  }

  const current = preview && JSON.stringify(preview.criteria) === JSON.stringify(criteria()) ? preview : null
  const ready = Boolean(current && current.count > 0 && Number(typedCount) === current.count)

  const runPurge = async () => {
    if (!ready || busy) return
    setPhase('purge')
    try {
      const json = await postPurge({ ...current.criteria, asOf: current.asOf, previewId: current.previewId, confirmCount: current.count }, false)
      previousPreviewId.current = null
      setPhase(null)
      onPurged(json.deleted)
    } catch (err) {
      setPreview(null)
      setTypedCount('')
      setError(err)
      setPhase(null)
    }
  }

  return (
    <Dialog
      title="ניקוי משוב"
      subtitle="מחיקה לצמיתות של אירועי משוב. אי אפשר לשחזר אותם."
      onClose={onClose}
      dismissible={!busy}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={busy} data-autofocus>ביטול</Button>
          <Button variant="danger" size="sm" icon="delete_forever" onClick={runPurge} disabled={!ready} softDisabled={busy}>
            {phase === 'purge' ? 'מוחק…' : 'מחק לצמיתות'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-5">
        <CheckRow tone="error" checked={all} onChange={(checked) => { setAll(checked); resetPreview() }} disabled={busy}>
          כל האירועים — בלי סינון (כל המשוב יימחק)
        </CheckRow>
        {!all && (
          <>
            <EventFilters filters={filters} onChange={(f) => { setFilters(f); resetPreview() }} models={models} disabled={busy} />
            <div className="flex flex-col">
              <label htmlFor={ids.key} className={FIELD_LABEL_COMPACT}>מזהה התקנה (לא חובה)</label>
              <input
                id={ids.key}
                type="text"
                dir="ltr"
                value={keyId}
                disabled={busy}
                onChange={(e) => { setKeyId(e.target.value); resetPreview() }}
                className={fieldClasses({ className: 'w-full max-w-md font-mono' })}
              />
            </div>
          </>
        )}
        <div>
          <Button variant="tonal" size="sm" icon="search" onClick={runPreview} softDisabled={busy}>
            {phase === 'preview' ? 'בודק…' : 'בדוק כמה יימחקו'}
          </Button>
        </div>
        {current && (
          <div className="flex flex-col gap-3 text-body-md" role="status">
            <p>
              {current.count === 0 ? 'אין אירועים למחיקה.' : <>יימחקו <strong className="font-normal tabular-nums">{formatNumber(current.count)}</strong> אירועים</>}
              {current.count > 0 && <span className="text-on-surface-variant"> (שנקלטו עד {fullDateText(current.asOf)})</span>}
            </p>
            {current.count > 0 && (
              <div className="flex flex-col">
                <label htmlFor={ids.count} className={FIELD_LABEL_COMPACT}>לאישור, הקלד את מספר האירועים</label>
                <input
                  id={ids.count}
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  autoComplete="off"
                  value={typedCount}
                  disabled={busy}
                  onChange={(e) => setTypedCount(e.target.value)}
                  className={fieldClasses({ className: 'w-36' })}
                />
              </div>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error.message}
            {error.sessionExpired && <> <a href={loginHref()} className="underline">התחבר</a></>}
          </p>
        )}
      </div>
    </Dialog>
  )
}
