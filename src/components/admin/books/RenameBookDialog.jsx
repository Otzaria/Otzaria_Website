'use client'

import { useId, useState } from 'react'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import SelectMenu from '@/components/ui/SelectMenu'
import { FIELD_ERROR, FIELD_HINT, FIELD_LABEL, fieldClasses } from '@/components/ui/fieldStyles'
import { DEFAULT_CATEGORY, isPersonal } from '@/lib/adminBooks/bookTerms'

/**
 * "שינוי שם" של ספר — השם והקטגוריה (באותו מקום, כמו קודם). לספר אישי אין קטגוריה לשנות: הבורר
 * לא מוצג, ובמקומו שורה אחת שאומרת למה. "שמור" מושבת כשאין שינוי; כשל (למשל "שם הספר כבר קיים") —
 * בתוך החלון, והטקסט נשמר. בזמן שמירה אי אפשר לסגור.
 * mode="category" — "שינוי קטגוריה" (מ-⋮ ומהמגירה): רק בורר הקטגוריה, בלי שדה השם.
 *
 * @param {{ book: any, categoryOptions: { value: string, label: string, color?: string }[], mode?: 'name' | 'category',
 *   onSave: (book: any, patch: { name: string, category?: string }) => Promise<void>, onClose: () => void }} props
 */
export default function RenameBookDialog({ book, categoryOptions, mode = 'name', onSave, onClose }) {
  const categoryOnly = mode === 'category'
  const personal = isPersonal(book)
  const initialCategory = book.category || DEFAULT_CATEGORY
  const [name, setName] = useState(book.name)
  const [category, setCategory] = useState(initialCategory)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const nameId = useId()
  const errorId = useId()
  const trimmed = name.trim()
  const changed = trimmed !== book.name || (!personal && category !== initialCategory)
  // קטגוריה שאינה בהגדרות (נמחקה) — נשארת כאפשרות, כדי שהבורר יראה את הערך הנוכחי
  const options = categoryOptions.some((o) => o.value === initialCategory) || personal
    ? categoryOptions
    : [{ value: initialCategory, label: initialCategory, hint: 'לא בהגדרות' }, ...categoryOptions]

  const save = async () => {
    if (!trimmed) {
      setError('כתוב שם לספר.')
      return
    }
    if (!changed || saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(book, personal ? { name: trimmed } : { name: trimmed, category })
      onClose()
    } catch (e) {
      setError(e?.message || 'לא הצלחנו לשמור את השינויים.')
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={categoryOnly ? 'שינוי קטגוריה' : 'שינוי שם'}
      subtitle={book.name}
      onClose={onClose}
      dismissible={!saving}
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} disabled={saving}>ביטול</Button>
          <Button variant="filled" size="sm" onClick={save} loading={saving} disabled={!changed}>{saving ? 'שומר…' : 'שמור'}</Button>
        </>
      )}
    >
      <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save() }}>
        {!categoryOnly && (
          <div>
            <label htmlFor={nameId} className={FIELD_LABEL}>שם הספר</label>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              className={fieldClasses({ invalid: Boolean(error) })}
              autoFocus
            />
            {error && <p id={errorId} role="alert" className={FIELD_ERROR}>{error}</p>}
          </div>
        )}
        {error && categoryOnly && <p role="alert" className={FIELD_ERROR}>{error}</p>}
        {personal ? (
          <p className={FIELD_HINT}>ספר אישי — אין לו קטגוריה לשנות.</p>
        ) : (
          <SelectMenu label="קטגוריה" options={options} value={category} onChange={setCategory} disabled={saving} searchable={options.length > 8} />
        )}
      </form>
    </Dialog>
  )
}
