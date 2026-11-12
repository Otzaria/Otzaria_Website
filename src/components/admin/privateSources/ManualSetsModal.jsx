'use client'

import { useId, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import CheckRow from '@/components/ui/CheckRow'
import Dialog from '@/components/ui/Dialog'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FIELD_ERROR, FIELD_LABEL_COMPACT, fieldClasses } from '@/components/ui/fieldStyles'
import { cx } from '@/components/ui/cx'
// קובץ טהור (ללא mongoose) ולכן ניתן לייבוא גם מרכיב לקוח
import { manualSetKeyFromLabel } from '@/lib/private-sources-sets'

/**
 * מודאל ניהול הסטים הידניים של ספרים פרטיים.
 *
 * סט ידני מקבץ ספרים שאינם נתפסים בקיבוץ האוטומטי ("<שם> על <נושא>"),
 * והשיוך הידני גובר עליו. השמירה כותבת את כל אובייקט הסטים בבת אחת.
 *
 * @param {object} manualSets  { [setKey]: { label, bookPaths } }
 * @param {Array}  books       כל הספרים ({ bookPath, bookTitle, category })
 * @param {(sets:object)=>Promise<void>} onSave
 *
 * המעטפת — ui/Dialog (כמו StatusConfigModal): גיליון תחתון בטלפון, לכידת פוקוס, Esc, כפתור סגירה עם שם. אישורים —
 * ui/ConfirmDialog (useConfirm); שם כפול — שגיאה מתחת לשדה. "מחק" בכל שורה — אחרון ובאדום.
 */
/** מספר הספרים המרבי שמוצג ברשימת הבחירה (הרשימה כולה עשויה להיות ענקית) */
const MAX_VISIBLE_BOOKS = 400

export default function ManualSetsModal({ manualSets, books, onSave, onClose }) {
  const [confirm, confirmElement] = useConfirm()
  const ids = { label: useId(), search: useId() }
  const [addError, setAddError] = useState('')

  const [sets, setSets] = useState(() => structuredClone(manualSets || {}))
  const [newLabel, setNewLabel] = useState('')
  const [editingKey, setEditingKey] = useState(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const bookByPath = useMemo(
    () => new Map((books || []).map((book) => [book.bookPath, book])),
    [books]
  )

  // נתיב → מפתח הסט שמחזיק בו (כדי לא לשייך ספר לשני סטים)
  const ownerBySetPath = useMemo(() => {
    const map = new Map()
    for (const [setKey, entry] of Object.entries(sets)) {
      for (const bookPath of entry.bookPaths || []) map.set(bookPath, setKey)
    }
    return map
  }, [sets])

  const editing = editingKey && Object.hasOwn(sets, editingKey) ? sets[editingKey] : null

  // חברי הסט הנבחר עולים לראש הרשימה, כדי שהתקרה לא תסתיר דווקא אותם
  const { visibleBooks, truncated } = useMemo(() => {
    const term = search.trim().toLowerCase()
    const selected = new Set(editing?.bookPaths || [])
    const matched = (books || []).filter((book) => {
      const owner = ownerBySetPath.get(book.bookPath)
      // מציגים את ספרי הסט הנוכחי ואת מי שאינו משויך לסט אחר
      if (owner && owner !== editingKey) return false
      if (!term) return true
      return (
        book.bookTitle.toLowerCase().includes(term) ||
        book.bookPath.toLowerCase().includes(term)
      )
    })
    const ordered =
      selected.size === 0
        ? matched
        : [
            ...matched.filter((book) => selected.has(book.bookPath)),
            ...matched.filter((book) => !selected.has(book.bookPath)),
          ]
    return {
      visibleBooks: ordered.slice(0, MAX_VISIBLE_BOOKS),
      truncated: ordered.length > MAX_VISIBLE_BOOKS,
    }
  }, [books, search, ownerBySetPath, editingKey, editing])

  const createSet = (label, setKey) => {
    setSets((prev) => ({ ...prev, [setKey]: { label, bookPaths: [] } }))
    setNewLabel('')
    setAddError('')
    setEditingKey(setKey)
    setSearch('')
  }

  const handleCreate = async () => {
    const label = newLabel.trim()
    if (!label) return
    const setKey = manualSetKeyFromLabel(label)
    // Object.hasOwn — כדי ששם כמו "constructor" לא ייחשב בטעות כמפתח קיים
    if (Object.hasOwn(sets, setKey)) {
      setAddError('כבר יש סט בשם הזה.')
      return
    }
    // ייתכן סט קיים באותו שם תצוגה אך במפתח אחר — עדיף לאשר במפורש
    const duplicateLabel = Object.values(sets).some(
      (entry) => String(entry?.label || '').trim() === label
    )
    if (duplicateLabel) {
      const ok = await confirm({
        title: 'שם כפול',
        body: `כבר יש סט בשם "${label}". ליצור עוד סט באותו שם?`,
        confirmLabel: 'צור בכל זאת',
      })
      if (ok) createSet(label, setKey)
      return
    }
    createSet(label, setKey)
  }

  const handleDeleteSet = async (setKey) => {
    const ok = await confirm({
      title: 'למחוק את הסט?',
      body: `הסט "${sets[setKey]?.label || setKey}" יימחק אחרי השמירה. הספרים עצמם לא ישתנו; פרטי המקור של הסט יישארו ברשימת פרטי המקור של ספרים שכבר לא קיימים, ואפשר למחוק אותם משם.`,
      confirmLabel: 'מחק',
      tone: 'danger',
    })
    if (!ok) return
    setSets((prev) => {
      const next = { ...prev }
      delete next[setKey]
      return next
    })
    if (editingKey === setKey) setEditingKey(null)
  }

  const toggleBook = (bookPath) => {
    if (!editingKey) return
    setSets((prev) => {
      const entry = prev[editingKey]
      if (!entry) return prev
      const paths = entry.bookPaths || []
      const bookPaths = paths.includes(bookPath)
        ? paths.filter((p) => p !== bookPath)
        : [...paths, bookPath]
      return { ...prev, [editingKey]: { ...entry, bookPaths } }
    })
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave(sets)
    } catch {
      // ההודעה על הכישלון — אצל ההורה (טוסט); כאן רק משחררים את הכפתור לניסיון נוסף
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      title="סטים ידניים"
      subtitle={'סט = כמה ספרים שחולקים פרטי מקור אחד. שיוך ידני גובר על הקיבוץ האוטומטי לפי "X על Y".'}
      onClose={onClose}
      dismissible={!saving}
      className="sm:max-w-4xl"
      footer={(
        <>
          <Button variant="text" size="sm" onClick={onClose} softDisabled={saving}>ביטול</Button>
          <Button variant="filled" size="sm" icon="save" onClick={handleSave} softDisabled={saving}>{saving ? 'שומר…' : 'שמור שינויים'}</Button>
        </>
      )}
    >
      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        {/* רשימת הסטים */}
        <section aria-labelledby="manual-sets-existing" className="flex min-w-0 flex-col gap-3">
          <h3 id="manual-sets-existing" className="text-title-sm text-on-surface">סטים קיימים</h3>
          {Object.keys(sets).length === 0 ? (
            <p className="text-body-sm text-on-surface-variant">עוד לא הוגדרו סטים ידניים.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {Object.entries(sets).map(([setKey, entry]) => {
                const isEditing = editingKey === setKey
                const count = (entry.bookPaths || []).length
                return (
                  <li key={setKey}
                    className={cx('flex min-w-0 items-center gap-2 rounded-(--radius-control) p-1 ps-3', isEditing ? 'bg-surface-selected' : 'bg-surface')}>
                    <button
                      type="button"
                      aria-pressed={isEditing}
                      onClick={() => {
                        setEditingKey(isEditing ? null : setKey)
                        setSearch('')
                      }}
                      className="flex min-h-(--touch-target) min-w-0 flex-1 flex-col items-start justify-center rounded-(--radius-control) text-start focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="block max-w-full truncate text-body-md text-on-surface">{entry.label}</span>
                      <span className="block text-body-sm text-on-surface-variant">{count === 1 ? 'ספר אחד' : `${count} ספרים`}</span>
                    </button>
                    <Button variant="text" size="sm" iconOnly icon="delete" aria-label={`מחק את הסט ${entry.label}`}
                      onClick={() => handleDeleteSet(setKey)} className="text-error! hover:bg-error-container/60!" />
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-2 flex flex-col gap-2 border-t border-outline-variant pt-4">
            <label htmlFor={ids.label} className="text-title-sm text-on-surface">סט חדש</label>
            <div className="flex min-w-0 gap-2">
              <input
                id={ids.label}
                type="text"
                value={newLabel}
                onChange={(e) => { setNewLabel(e.target.value); setAddError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate() } }}
                placeholder="שם הסט (למשל: עולת שלמה)"
                aria-invalid={addError ? true : undefined}
                className={fieldClasses({ className: 'min-w-0 flex-1' })}
              />
              <Button variant="tonal" size="sm" icon="add" onClick={handleCreate} softDisabled={!newLabel.trim()}>הוסף</Button>
            </div>
            {addError && <p role="alert" className={FIELD_ERROR}>{addError}</p>}
          </div>
        </section>

        {/* בחירת ספרים לסט הנבחר */}
        <section aria-labelledby="manual-sets-books" className="flex min-w-0 flex-col gap-2">
          <h3 id="manual-sets-books" className="text-title-sm text-on-surface">
            {editing ? `הספרים בסט "${editing.label}"` : 'הספרים בסט'}
          </h3>
          {!editing ? (
            <p className="text-body-sm text-on-surface-variant">בחר סט מהרשימה כדי לשייך אליו ספרים.</p>
          ) : (
            <>
              <label htmlFor={ids.search} className={FIELD_LABEL_COMPACT}>חיפוש ספר</label>
              <input
                id={ids.search}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="לפי שם או נתיב"
                className={fieldClasses({ className: 'w-full' })}
              />
              <div className="max-h-72 overflow-y-auto rounded-(--radius-control) bg-surface px-3" role="group" aria-label={`הספרים בסט ${editing.label}`}>
                {visibleBooks.length === 0 ? (
                  <p className="py-3 text-body-sm text-on-surface-variant">לא נמצאו ספרים.</p>
                ) : (
                  visibleBooks.map((book) => (
                    <CheckRow key={book.bookPath} checked={(editing.bookPaths || []).includes(book.bookPath)} onChange={() => toggleBook(book.bookPath)}>
                      <span className="block truncate text-body-md">{book.bookTitle}</span>
                      <span className="block truncate text-body-sm text-on-surface-variant">{book.category}</span>
                    </CheckRow>
                  ))
                )}
              </div>
              {truncated && (
                <p className="text-body-sm text-on-surface-variant">מוצגים {MAX_VISIBLE_BOOKS} הראשונים — צמצם בחיפוש.</p>
              )}
              {(editing.bookPaths || []).some((path) => !bookByPath.has(path)) && (
                <p className="text-body-sm text-on-warning-container">
                  בסט יש ספרים שכבר לא נמצאים ב-GitHub — הם יישמרו בסט, אבל לא מוצגים כאן.
                </p>
              )}
            </>
          )}
        </section>
      </div>
      {confirmElement}
    </Dialog>
  )
}
