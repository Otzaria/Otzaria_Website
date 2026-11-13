'use client'

import { useId, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import PageRangeFields from '@/components/ui/PageRangeFields'
import ProgressBar from '@/components/ui/ProgressBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { cx } from '@/components/ui/cx'
import { CHECKBOX, FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { DEFAULT_CATEGORY, MAX_SOURCE_PDF_BYTES, fileSizeText, nameFromFile, newBookErrors, slicedSizeError, uploadRangeSummary } from '@/lib/adminBooks/bookTerms'
import { parsePageRangeInput } from '@/lib/pageRange'
import { uploadBook } from './booksApi'
import { slicePdf } from './pdfSlice'
import usePdfPages from './usePdfPages'

const EMPTY_RANGE = { from: '', to: '' }

/** לתת לדפדפן לצייר את "מכין את העמודים…" לפני החיתוך (שתופס את ה-thread הראשי) */
const nextPaint = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0))
  else setTimeout(resolve, 0)
})

/**
 * "הוספת ספר" — קובץ PDF, שם (מוצע משם הקובץ), קטגוריה, והאם להסתיר / לשלוח הודעה למנויים.
 *
 * טווח עמודים: כשנבחר קובץ, הדפדפן סופר את העמודים בו (usePdfPages), ואפשר לבחור "מעמוד / עד עמוד".
 * בטווח חלקי — בשליחה נבנה בדפדפן PDF רק מהעמודים האלה (pdfSlice), ונשלח הוא במקום הקובץ. כך אפשר
 * להעלות חלק מקובץ גדול מ-50MB (עד 500MB), ומגבלת ה-50MB של השרת חלה על החלק. השרת לא משתנה ולא יודע
 * על הטווח: העמודים בספר ממוספרים 1..N (ושורת הסיכום אומרת את זה). בלי טווח — הקובץ נשלח כמו שהוא.
 * קובץ שאי אפשר לקרוא בדפדפן, או מוצפן — רק העלאה שלמה (השדות מושבתים, והשורה אומרת למה).
 *
 * הבדיקות (שם, PDF, גודל, טווח) — לפני ההעלאה. אחר כך: "מכין את העמודים…" (בטווח), פס התקדמות, ואחריו
 * "מחלק לעמודים…" (ההמרה בשרת לוקחת זמן); אי אפשר לסגור באמצע. הצלחה — onAdded(שם) והחלון נסגר;
 * כשל — בתוך החלון. "שלח הודעה" לא זמין לספר מוסתר (אין מה להודיע), והשורה אומרת למה.
 *
 * @param {{ categoryOptions: { value: string, label: string, color?: string }[], onAdded: (name: string) => void, onClose: () => void }} props
 */
export default function AddBookDialog({ categoryOptions, onAdded, onClose }) {
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState(() => (categoryOptions.some((o) => o.value === DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : categoryOptions[0]?.value ?? DEFAULT_CATEGORY))
  const [hidden, setHidden] = useState(false)
  const [notify, setNotify] = useState(false)
  const [rangeInput, setRangeInput] = useState(EMPTY_RANGE)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [phase, setPhase] = useState(null) // null | 'slicing' | 'uploading'
  const [progress, setProgress] = useState(0) // 0..1, בשלב 'uploading'
  const inputRef = useRef(null)
  const ids = { file: useId(), fileError: useId(), name: useId(), nameError: useId(), hidden: useId(), notify: useId(), notifyHint: useId(), server: useId() }

  // לא טוענים לזיכרון קובץ שממילא גדול מדי (newBookErrors יגיד), או שאינו PDF
  const readable = file && file.size <= MAX_SOURCE_PDF_BYTES && !newBookErrors({ name: 'x', file, partial: true }).file
  const pdf = usePdfPages(readable ? file : null)
  const canSlice = pdf.status === 'ready' && !pdf.encrypted
  const parsedRange = canSlice ? parsePageRangeInput(rangeInput, { total: pdf.pageCount }) : { ok: true, range: null }

  const busy = phase !== null
  const converting = phase === 'uploading' && progress >= 1

  const pick = (picked) => {
    if (!picked) return
    setFile(picked)
    setRangeInput(EMPTY_RANGE)
    setErrors((e) => ({ ...e, file: undefined, range: undefined, rangeField: undefined }))
    if (!name.trim()) setName(nameFromFile(picked.name))
  }

  const changeRange = (next) => {
    setRangeInput(next)
    setErrors((e) => ({ ...e, range: undefined, rangeField: undefined, file: undefined }))
  }

  const fail = (message) => {
    setServerError(message)
    setPhase(null)
  }

  const submit = async () => {
    if (busy) return
    const range = parsedRange.ok ? parsedRange.range : null
    // בזמן הקריאה עוד לא ידוע אם אפשר לחתוך — ההודעה על קובץ גדול מציעה טווח (השדות ייפתחו מיד)
    const found = newBookErrors({ name, file, partial: Boolean(range), canSlice: canSlice || pdf.status === 'reading' })
    if (!parsedRange.ok) Object.assign(found, { range: parsedRange.error, rangeField: parsedRange.field })
    setErrors(found)
    setServerError('')
    if (found.file || found.name || found.range) return

    let upload = file
    if (range) {
      setPhase('slicing')
      await nextPaint()
      try {
        upload = await slicePdf(pdf.doc, range, file.name)
      } catch {
        fail('לא הצלחנו להכין את העמודים שנבחרו מהקובץ. נסה להעלות את הקובץ כולו, או קובץ אחר.')
        return
      }
      const tooBig = slicedSizeError(upload.size)
      if (tooBig) {
        setErrors({ range: tooBig })
        setPhase(null)
        return
      }
    }

    const form = new FormData()
    form.append('pdf', upload)
    form.append('bookName', name.trim())
    form.append('category', category)
    form.append('isHidden', String(hidden))
    form.append('sendNotification', String(!hidden && notify))
    setProgress(0)
    setPhase('uploading')
    try {
      await uploadBook(form, { onProgress: setProgress })
      onAdded(name.trim())
      onClose()
    } catch (e) {
      fail(e?.message || 'לא הצלחנו להוסיף את הספר. נסה שוב.')
    }
  }

  const rangeHint = (() => {
    if (pdf.status === 'reading') return 'סופר את העמודים בקובץ…'
    if (pdf.status === 'failed') return 'לא הצלחנו לקרוא את העמודים בקובץ כאן — אפשר להעלות אותו רק בשלמותו.'
    if (pdf.status === 'ready' && pdf.encrypted) return `הקובץ מוגן בהצפנה (${pdf.pageCount} עמודים) — אפשר להעלות אותו רק בשלמותו.`
    if (pdf.status === 'ready' && parsedRange.ok) return uploadRangeSummary(parsedRange.range, pdf.pageCount)
    return 'ריק = מתחילת הקובץ / עד סופו.'
  })()

  return (
    <Dialog
      title="הוסף ספר"
      subtitle="קובץ PDF — כולו (עד 50MB), או רק חלק מהעמודים שבו. אחרי ההעלאה הספר מתחלק לעמודים."
      onClose={onClose}
      dismissible={!busy}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={busy}>ביטול</Button>
          <Button variant="filled" size="sm" icon="add" onClick={submit} loading={busy}>{busy ? 'מוסיף…' : 'הוסף ספר'}</Button>
        </>
      )}
    >
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div>
          <span id={ids.file} className={FIELD_LABEL}>קובץ PDF</span>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-labelledby={ids.file}
            aria-describedby={errors.file ? ids.fileError : undefined}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (!busy) pick(e.dataTransfer.files?.[0]) }}
            className={cx(
              'flex w-full items-center gap-3 rounded-(--field-radius) border border-dashed bg-(--field-bg) px-4 py-4 text-start transition-colors hover:bg-surface-selected disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity)',
              errors.file ? 'border-error' : 'border-(--field-border)',
              FOCUS_RING
            )}
          >
            <AppIcon name={file ? 'picture_as_pdf' : 'upload_file'} className="shrink-0 text-icon-xl text-primary" />
            <span className="min-w-0 flex-1">
              {file ? (
                <>
                  <span className="block truncate text-body-md text-on-surface"><bdi>{file.name}</bdi></span>
                  <span className="block text-body-sm text-on-surface-variant">
                    {fileSizeText(file.size)}
                    {pdf.status === 'ready' && ` · ${pdf.pageCount} עמודים`}
                    {' · לחץ להחלפה'}
                  </span>
                </>
              ) : (
                <>
                  <span className="block text-body-md text-on-surface">בחר קובץ PDF</span>
                  <span className="block text-body-sm text-on-surface-variant">או גרור אותו לכאן</span>
                </>
              )}
            </span>
          </button>
          {errors.file && <p id={ids.fileError} role="alert" className={FIELD_ERROR}>{errors.file}</p>}
        </div>

        {readable && (
          <PageRangeFields
            legend="אילו עמודים להעלות"
            value={rangeInput}
            onChange={changeRange}
            total={canSlice ? pdf.pageCount : undefined}
            disabled={busy || !canSlice}
            error={errors.range}
            errorField={errors.rangeField}
            hint={rangeHint}
          />
        )}

        <div>
          <label htmlFor={ids.name} className={FIELD_LABEL}>שם הספר</label>
          <input
            id={ids.name}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((er) => ({ ...er, name: undefined })) }}
            disabled={busy}
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={errors.name ? ids.nameError : undefined}
            className={fieldClasses({ invalid: Boolean(errors.name) })}
          />
          {errors.name && <p id={ids.nameError} role="alert" className={FIELD_ERROR}>{errors.name}</p>}
        </div>

        <SelectMenu label="קטגוריה" options={categoryOptions} value={category} onChange={setCategory} disabled={busy} searchable={categoryOptions.length > 8} />

        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">נראות</legend>
          <label htmlFor={ids.hidden} className="flex cursor-pointer items-start gap-3 text-body-md text-on-surface">
            <input id={ids.hidden} type="checkbox" className={CHECKBOX} checked={hidden} disabled={busy} onChange={(e) => setHidden(e.target.checked)} />
            <span>הסתר את הספר <span className="text-on-surface-variant">— רק מנהלים יראו אותו, עד שתציג אותו</span></span>
          </label>
          <div>
            <label htmlFor={ids.notify} className={cx('flex items-start gap-3 text-body-md text-on-surface', hidden ? 'cursor-not-allowed opacity-(--button-disabled-opacity)' : 'cursor-pointer')}>
              <input
                id={ids.notify}
                type="checkbox"
                className={CHECKBOX}
                checked={!hidden && notify}
                disabled={busy || hidden}
                aria-describedby={hidden ? ids.notifyHint : undefined}
                onChange={(e) => setNotify(e.target.checked)}
              />
              <span>שלח הודעה במייל למנויים על הספר</span>
            </label>
            {hidden && <p id={ids.notifyHint} className={cx(FIELD_HINT, 'ps-8')}>ספר מוסתר — אפשר לשלוח הודעה כשתציג אותו.</p>}
          </div>
        </fieldset>

        {busy && (
          <div role="status" className="flex flex-col gap-2">
            <p className="text-body-sm text-on-surface-variant">
              {phase === 'slicing'
                ? 'מכין את העמודים שנבחרו…'
                : converting ? 'מחלק את הספר לעמודים… בספר גדול זה עשוי לקחת כמה דקות.' : `מעלה את הקובץ… ${Math.round(progress * 100)}%`}
            </p>
            <ProgressBar value={phase === 'slicing' ? 0 : converting ? 1 : progress} max={1} label="התקדמות ההעלאה" size="md" />
          </div>
        )}

        {serverError && <p id={ids.server} role="alert" className={FIELD_ERROR}>{serverError}</p>}
      </form>
    </Dialog>
  )
}
