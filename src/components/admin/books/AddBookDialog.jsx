'use client'

import { useId, useRef, useState } from 'react'
import AppIcon from '@/components/ui/AppIcon'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import ProgressBar from '@/components/ui/ProgressBar'
import SelectMenu from '@/components/ui/SelectMenu'
import { cx } from '@/components/ui/cx'
import { CHECKBOX, FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { DEFAULT_CATEGORY, fileSizeText, nameFromFile, newBookErrors } from '@/lib/adminBooks/bookTerms'
import { uploadBook } from './booksApi'

/**
 * "הוספת ספר" — קובץ PDF (עד 50MB), שם (מוצע משם הקובץ), קטגוריה, והאם להסתיר / לשלוח הודעה למנויים.
 * הבדיקות (שם, PDF, גודל) — לפני ההעלאה, כמו בשרת. בזמן ההעלאה — פס התקדמות, ואחריה "מחלק לעמודים…"
 * (ההמרה בשרת לוקחת זמן); אי אפשר לסגור באמצע. הצלחה — onAdded(שם) והחלון נסגר; כשל — בתוך החלון.
 * "שלח הודעה" לא זמין לספר מוסתר (אין מה להודיע), והשורה אומרת למה.
 *
 * @param {{ categoryOptions: { value: string, label: string, color?: string }[], onAdded: (name: string) => void, onClose: () => void }} props
 */
export default function AddBookDialog({ categoryOptions, onAdded, onClose }) {
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState(() => (categoryOptions.some((o) => o.value === DEFAULT_CATEGORY) ? DEFAULT_CATEGORY : categoryOptions[0]?.value ?? DEFAULT_CATEGORY))
  const [hidden, setHidden] = useState(false)
  const [notify, setNotify] = useState(false)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [progress, setProgress] = useState(null) // null | 0..1
  const inputRef = useRef(null)
  const ids = { file: useId(), fileError: useId(), name: useId(), nameError: useId(), hidden: useId(), notify: useId(), notifyHint: useId(), server: useId() }
  const uploading = progress !== null
  const converting = uploading && progress >= 1

  const pick = (picked) => {
    if (!picked) return
    setFile(picked)
    setErrors((e) => ({ ...e, file: undefined }))
    if (!name.trim()) setName(nameFromFile(picked.name))
  }

  const submit = async () => {
    if (uploading) return
    const found = newBookErrors({ name, file })
    setErrors(found)
    setServerError('')
    if (found.file || found.name) return
    const form = new FormData()
    form.append('pdf', file)
    form.append('bookName', name.trim())
    form.append('category', category)
    form.append('isHidden', String(hidden))
    form.append('sendNotification', String(!hidden && notify))
    setProgress(0)
    try {
      await uploadBook(form, { onProgress: setProgress })
      onAdded(name.trim())
      onClose()
    } catch (e) {
      setServerError(e?.message || 'לא הצלחנו להוסיף את הספר. נסה שוב.')
      setProgress(null)
    }
  }

  return (
    <Dialog
      title="הוספת ספר"
      subtitle="קובץ PDF עד 50MB. אחרי ההעלאה הספר מתחלק לעמודים."
      onClose={onClose}
      dismissible={!uploading}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={uploading}>ביטול</Button>
          <Button variant="filled" size="sm" icon="add" onClick={submit} loading={uploading}>{uploading ? 'מוסיף…' : 'הוסף ספר'}</Button>
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
            disabled={uploading}
            aria-labelledby={ids.file}
            aria-describedby={errors.file ? ids.fileError : undefined}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (!uploading) pick(e.dataTransfer.files?.[0]) }}
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
                  <span className="block text-body-sm text-on-surface-variant">{fileSizeText(file.size)} · לחץ להחלפה</span>
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

        <div>
          <label htmlFor={ids.name} className={FIELD_LABEL}>שם הספר</label>
          <input
            id={ids.name}
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setErrors((er) => ({ ...er, name: undefined })) }}
            disabled={uploading}
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={errors.name ? ids.nameError : undefined}
            className={fieldClasses({ invalid: Boolean(errors.name) })}
          />
          {errors.name && <p id={ids.nameError} role="alert" className={FIELD_ERROR}>{errors.name}</p>}
        </div>

        <SelectMenu label="קטגוריה" options={categoryOptions} value={category} onChange={setCategory} disabled={uploading} searchable={categoryOptions.length > 8} />

        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">נראות</legend>
          <label htmlFor={ids.hidden} className="flex cursor-pointer items-start gap-3 text-body-md text-on-surface">
            <input id={ids.hidden} type="checkbox" className={CHECKBOX} checked={hidden} disabled={uploading} onChange={(e) => setHidden(e.target.checked)} />
            <span>הסתר את הספר <span className="text-on-surface-variant">— רק מנהלים יראו אותו, עד שתציג אותו</span></span>
          </label>
          <div>
            <label htmlFor={ids.notify} className={cx('flex items-start gap-3 text-body-md text-on-surface', hidden ? 'cursor-not-allowed opacity-(--button-disabled-opacity)' : 'cursor-pointer')}>
              <input
                id={ids.notify}
                type="checkbox"
                className={CHECKBOX}
                checked={!hidden && notify}
                disabled={uploading || hidden}
                aria-describedby={hidden ? ids.notifyHint : undefined}
                onChange={(e) => setNotify(e.target.checked)}
              />
              <span>שלח הודעה במייל למנויים על הספר</span>
            </label>
            {hidden && <p id={ids.notifyHint} className={cx(FIELD_HINT, 'ps-8')}>ספר מוסתר — אפשר לשלוח הודעה כשתציג אותו.</p>}
          </div>
        </fieldset>

        {uploading && (
          <div role="status" className="flex flex-col gap-2">
            <p className="text-body-sm text-on-surface-variant">
              {converting ? 'מחלק את הספר לעמודים… בספר גדול זה עשוי לקחת כמה דקות.' : `מעלה את הקובץ… ${Math.round(progress * 100)}%`}
            </p>
            <ProgressBar value={converting ? 1 : progress} max={1} label="התקדמות ההעלאה" size="md" />
          </div>
        )}

        {serverError && <p id={ids.server} role="alert" className={FIELD_ERROR}>{serverError}</p>}
      </form>
    </Dialog>
  )
}
