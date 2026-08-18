'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '@/components/providers/DialogContext'
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
 */
/** מספר הספרים המרבי שמוצג ברשימת הבחירה (הרשימה כולה עשויה להיות ענקית) */
const MAX_VISIBLE_BOOKS = 400

export default function ManualSetsModal({ manualSets, books, onSave, onClose }) {
  const { showConfirm, showMessage } = useDialog()

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
    setEditingKey(setKey)
    setSearch('')
  }

  const handleCreate = () => {
    const label = newLabel.trim()
    if (!label) return
    const setKey = manualSetKeyFromLabel(label)
    // Object.hasOwn — כדי ששם כמו "constructor" לא ייחשב בטעות כמפתח קיים
    if (Object.hasOwn(sets, setKey)) {
      showMessage('שם קיים', 'כבר קיים סט בשם זה')
      return
    }
    // ייתכן סט קיים באותו שם תצוגה אך במפתח אחר — עדיף לאשר במפורש
    const duplicateLabel = Object.values(sets).some(
      (entry) => String(entry?.label || '').trim() === label
    )
    if (duplicateLabel) {
      showConfirm(
        'שם כפול',
        `כבר קיים סט בשם "${label}" (במפתח אחר). ליצור סט נוסף באותו שם?`,
        () => createSet(label, setKey),
        'צור בכל זאת',
        'ביטול'
      )
      return
    }
    createSet(label, setKey)
  }

  const handleDeleteSet = (setKey) => {
    showConfirm(
      'מחיקת סט',
      `למחוק את הסט "${sets[setKey]?.label || setKey}"? הספרים עצמם לא יושפעו, ורשומת המקור של הסט תופיע כרשומה נטושה שניתן למחוק.`,
      () => {
        setSets((prev) => {
          const next = { ...prev }
          delete next[setKey]
          return next
        })
        if (editingKey === setKey) setEditingKey(null)
      },
      'מחק',
      'ביטול'
    )
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
    setSaving(true)
    try {
      await onSave(sets)
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-start gap-4 p-5 border-b">
          <div>
            <h2 className="text-xl font-bold text-neutral-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-feature-600">library_books</span>
              ניהול סטים ידניים
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              סט = כמה ספרים שחולקים רשומת מקור אחת. שיוך ידני גובר על הקיבוץ האוטומטי לפי
              &quot;X על Y&quot;.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* רשימת הסטים */}
          <div>
            <h3 className="text-sm font-bold text-neutral-700 mb-2">סטים קיימים</h3>
            {Object.keys(sets).length === 0 ? (
              <p className="text-sm text-neutral-500">לא הוגדרו סטים ידניים.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(sets).map(([setKey, entry]) => {
                  const isEditing = editingKey === setKey
                  return (
                    <div
                      key={setKey}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${
                        isEditing ? 'border-primary bg-primary/5' : 'border-neutral-200'
                      }`}
                    >
                      <button
                        onClick={() => {
                          setEditingKey(isEditing ? null : setKey)
                          setSearch('')
                        }}
                        className="flex-1 min-w-0 text-right"
                      >
                        <span className="block font-medium text-neutral-800 truncate">
                          {entry.label}
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {(entry.bookPaths || []).length} ספרים
                        </span>
                      </button>
                      <button
                        onClick={() => handleDeleteSet(setKey)}
                        className="p-2 text-danger-600 hover:bg-danger-50 rounded transition-colors"
                        title="מחיקת הסט"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-bold text-neutral-700 mb-2">יצירת סט חדש</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="שם הסט (למשל: עולת שלמה)"
                  className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newLabel.trim()}
                  className="px-4 py-2 text-sm bg-success-600 text-white rounded-lg hover:bg-success-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  הוספה
                </button>
              </div>
            </div>
          </div>

          {/* בחירת ספרים לסט הנבחר */}
          <div>
            <h3 className="text-sm font-bold text-neutral-700 mb-2">
              {editing ? `ספרים בסט "${editing.label}"` : 'ספרי הסט'}
            </h3>
            {!editing ? (
              <p className="text-sm text-neutral-500">בחר סט מהרשימה כדי לשייך אליו ספרים.</p>
            ) : (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש ספר לפי שם או נתיב"
                  className="w-full px-3 py-2 mb-2 border border-neutral-300 rounded-lg text-sm bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="border border-neutral-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-neutral-100">
                  {visibleBooks.length === 0 ? (
                    <p className="text-sm text-neutral-500 p-3">לא נמצאו ספרים.</p>
                  ) : (
                    visibleBooks.map((book) => (
                      <label
                        key={book.bookPath}
                        className="flex items-start gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={(editing.bookPaths || []).includes(book.bookPath)}
                          onChange={() => toggleBook(book.bookPath)}
                          className="w-4 h-4 mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{book.bookTitle}</span>
                          <span className="block text-xs text-neutral-400 truncate">
                            {book.category}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {truncated && (
                  <p className="text-xs text-neutral-500 mt-2">
                    מוצגים {MAX_VISIBLE_BOOKS} הראשונים — צמצם באמצעות החיפוש
                  </p>
                )}
                {(editing.bookPaths || []).some((path) => !bookByPath.has(path)) && (
                  <p className="text-xs text-warning-700 mt-2">
                    בסט יש נתיבים שאינם קיימים כרגע בגיטהאב — הם יישמרו אך לא יוצגו כחברים.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end items-center gap-3 p-5 border-t bg-neutral-50">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-400 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
