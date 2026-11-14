'use client'

import { useCallback, useId, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SelectMenu from '@/components/ui/SelectMenu'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { useLoadedData } from '@/components/admin/list/useListData'
import { formatNumber } from '@/lib/adminTerms'
import { SCRIPT_LABELS, SCRIPT_TYPES } from '@/lib/adminTrainingScreen/trainingTerms'
import { validateAddPage } from '@/lib/adminTrainingScreen/trainingPagesQuery'
import { addTrainingPage, loadTrainingBooks } from './trainingApi'

const SCRIPT_OPTIONS = SCRIPT_TYPES.map((value) => ({ value, label: SCRIPT_LABELS[value] }))

/**
 * מגירת "הוסף עמוד": ספר (כולל ספרים מוסתרים — עם סימון), מספר עמוד וסוג כתב. אותה בקשה כמו קודם
 * (POST /api/admin/ocr-training עם bookId, pageNumber, scriptType). אחרי הוספה — המגירה נשארת פתוחה עם אותו
 * ספר, כדי להוסיף עוד עמוד ממנו (כמו בטופס הקודם, שניקה רק את מספר העמוד).
 * @param {{ onClose: () => void, onAdded: (text: string) => void }} props
 */
export default function AddTrainingPageDrawer({ onClose, onAdded }) {
  const ids = { page: useId(), error: useId() }
  const books = useLoadedData(loadTrainingBooks, { initial: [] })
  const [bookId, setBookId] = useState('')
  const [added, setAdded] = useState('')
  const [pageNumber, setPageNumber] = useState('')
  const [scriptType, setScriptType] = useState('square')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const book = books.data.find((b) => b.id === bookId) || null
  const options = useMemo(() => books.data.map((b) => ({
    value: b.id,
    label: b.name,
    hint: [b.isHidden ? 'מוסתר' : '', b.totalPages ? `${formatNumber(b.totalPages)} עמ׳` : ''].filter(Boolean).join(' · ') || undefined,
  })), [books.data])

  const close = useCallback(() => { if (!saving) onClose() }, [saving, onClose])
  const submit = async (event) => {
    event?.preventDefault()
    if (saving) return
    const checked = validateAddPage({ book, pageNumber })
    if ('error' in checked) {
      setError(checked.error)
      if (book) document.getElementById(ids.page)?.focus()
      return
    }
    setError('')
    setSaving(true)
    try {
      await addTrainingPage({ ...checked.body, scriptType })
      const text = `נוסף: ${book.name}, עמוד ${formatNumber(checked.body.pageNumber)}`
      onAdded(text)
      // האישור גם בתוך המגירה (שנשארת פתוחה להוספת עמוד נוסף) — לא רק בהודעה הצפה
      setAdded(text)
      setPageNumber('')
      document.getElementById(ids.page)?.focus()
    } catch (e) {
      setError(e?.message || 'לא הצלחנו להוסיף את העמוד.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      title="הוסף עמוד"
      subtitle="עמוד מספר קיים, שמתנדבים יסמנו בו שורות ויקלידו אותן."
      onClose={close}
      dismissible={!saving}
      footer={(
        <>
          {error && <p id={ids.error} role="alert" className="me-auto min-w-0 flex-1 basis-48 text-body-sm text-error">{error}</p>}
          <Button variant="text" size="sm" onClick={close} disabled={saving}>{added ? 'סיום' : 'סגור'}</Button>
          <Button variant="filled" size="sm" icon="add" onClick={submit} loading={saving}>{saving ? 'מוסיף…' : 'הוסף'}</Button>
        </>
      )}
    >
      <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
        <p role="status" className={added ? 'rounded-(--radius-control) bg-success-container px-3 py-2 text-body-sm text-on-success-container' : 'sr-only'}>
          {added && `${added}. אפשר להוסיף עוד עמוד.`}
        </p>
        <div>
          <SelectMenu
            label="ספר"
            labelSize="lg"
            options={options}
            value={bookId}
            onChange={(v) => { setBookId(v || ''); setError('') }}
            searchable
            searchPlaceholder="חפש ספר"
            placeholder={books.status === 'loading' ? 'טוען את רשימת הספרים…' : 'בחר ספר'}
            disabled={saving || books.status !== 'ready'}
            highlight={false}
            emptyText="לא נמצא ספר"
          />
          <p className={FIELD_HINT}>גם ספרים מוסתרים מופיעים כאן.</p>
          {books.status === 'error' && (
            <div className={FIELD_ERROR} role="alert">
              <span className="min-w-0 flex-1">{books.error?.message || 'לא הצלחנו לטעון את רשימת הספרים.'}</span>
              <Button variant="text" size="sm" icon="refresh" onClick={books.retry}>נסה שוב</Button>
            </div>
          )}
        </div>
        <div>
          <label htmlFor={ids.page} className={FIELD_LABEL}>מספר עמוד</label>
          <input
            id={ids.page}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={pageNumber}
            onChange={(e) => { setPageNumber(e.target.value); setError(''); setAdded('') }}
            disabled={saving}
            aria-describedby={error ? ids.error : undefined}
            className={fieldClasses({ className: 'w-40' })}
            placeholder="לדוגמה 5"
          />
          {book?.totalPages ? <p className={FIELD_HINT}>בספר {formatNumber(book.totalPages)} עמודים.</p> : null}
        </div>
        <div>
          <p id={`${ids.page}-script`} className={FIELD_LABEL}>סוג כתב</p>
          <SegmentedControl options={SCRIPT_OPTIONS} value={scriptType} onChange={setScriptType} labelledBy={`${ids.page}-script`} />
        </div>
      </form>
    </Drawer>
  )
}
