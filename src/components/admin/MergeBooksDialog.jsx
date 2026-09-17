'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useDialog } from '@/components/providers/DialogContext'

/**
 * MergeBooksDialog - חלון מיזוג ספרים (מדף ניהול הספרים)
 *
 * מנהל באופן עצמאי את כל תהליך המיזוג: בחירת ספרים מהרשימה המלאה, סידור
 * מחדש של סדר המיזוג, שם הספר המאוחד, האם להסתירו, ושליחת הבקשה לשרת.
 *
 * בדיוק כמו בהתנהגות המקורית בדף, הקומפוננטה נשארת מורכבת (mounted) תמיד
 * וההורה שולט בנראות שלה דרך isOpen - כך שביטול (ללא מיזוג מוצלח) לא
 * מאפס את הבחירות שנעשו, בדיוק כפי שקרה כשה-state היה ברמת הדף.
 *
 * Props:
 * - isOpen: האם החלון גלוי
 * - books: כל רשימת הספרים (למקור הבחירה)
 * - onClose(): סגירת החלון (ביטול, ללא איפוס בחירות)
 * - onMergeComplete(): נקרא לאחר מיזוג מוצלח (למשל, לרענון רשימת הספרים)
 */
export default function MergeBooksDialog({ isOpen, books, onClose, onMergeComplete }) {
  const { showAlert } = useDialog()
  const [selectedBooksToMerge, setSelectedBooksToMerge] = useState([])
  const [mergedBookName, setMergedBookName] = useState('')
  const [isMergedHidden, setIsMergedHidden] = useState(false)
  const [isMerging, setIsMerging] = useState(false)

  const addBookToMergeList = (book) => {
    if (!selectedBooksToMerge.find(b => b.id === book.id)) {
      setSelectedBooksToMerge(prev => [...prev, book])
    }
  }

  const removeBookFromMergeList = (bookId) => {
    setSelectedBooksToMerge(prev => prev.filter(b => b.id !== bookId))
  }

  const moveBookOrder = (index, direction) => {
    const newDocs = [...selectedBooksToMerge]
    if (direction === 'up' && index > 0) {
      [newDocs[index], newDocs[index - 1]] = [newDocs[index - 1], newDocs[index]]
    } else if (direction === 'down' && index < newDocs.length - 1) {
      [newDocs[index], newDocs[index + 1]] = [newDocs[index + 1], newDocs[index]]
    }
    setSelectedBooksToMerge(newDocs)
  }

  const handleMergeSubmit = async () => {
    if (selectedBooksToMerge.length < 2) {
      showAlert('שים לב', 'יש לבחור לפחות 2 ספרים למיזוג')
      return
    }
    if (!mergedBookName.trim()) {
      showAlert('שים לב', 'יש לבחור שם לספר המאוחד')
      return
    }

    setIsMerging(true)
    try {
      const orderedBookIds = selectedBooksToMerge.map(b => b.id)

      const response = await fetch('/api/admin/books/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookIds: orderedBookIds,
          newName: mergedBookName,
          isHidden: isMergedHidden
        })
      })

      const result = await response.json()

      if (result.success) {
        showAlert('הצלחה', 'הספרים מוזגו בהצלחה!')
        onClose()
        setSelectedBooksToMerge([])
        setMergedBookName('')
        setIsMergedHidden(false)
        if (onMergeComplete) onMergeComplete()
      } else {
        showAlert('שגיאה', result.error || 'שגיאה במיזוג הספרים')
      }
    } catch (e) {
      console.error(e)
      showAlert('שגיאה', 'שגיאה בתקשורת עם השרת')
    } finally {
      setIsMerging(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden relative flex flex-col h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b bg-neutral-50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-feature-100 p-2 rounded-full">
              <span className="material-symbols-outlined text-feature-600">call_merge</span>
            </div>
            <div>
              <h3 className="font-bold text-xl text-neutral-800">מיזוג ספרים</h3>
              <p className="text-xs text-neutral-500">בחר ספרים וסדר אותם לפי הסדר הרצוי</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 rounded-full hover:bg-neutral-200 p-1">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          <div className="w-full md:w-1/2 border-l p-4 flex flex-col bg-neutral-50/50">
            <h4 className="font-bold text-neutral-700 mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">library_books</span>
              בחר ספרים להוספה
            </h4>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {books.map(book => {
                const isSelected = selectedBooksToMerge.some(b => b.id === book.id)
                if (isSelected) return null

                return (
                  <div
                    key={book.id}
                    onClick={() => addBookToMergeList(book)}
                    className="bg-white p-3 rounded-lg border hover:border-feature-300 hover:shadow-sm cursor-pointer transition-all flex items-center gap-3 group"
                  >
                    {book.thumbnail ? (
                      <Image src={book.thumbnail} alt="" width={30} height={40} className="rounded object-cover shadow-sm" />
                    ) : (
                      <div className="w-[30px] h-[40px] bg-neutral-100 rounded flex items-center justify-center">
                        <span className="material-symbols-outlined text-neutral-300 text-sm">book</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-neutral-800 truncate">{book.name}</div>
                      <div className="text-xs text-neutral-500">{book.category}</div>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center group-hover:bg-feature-100 group-hover:text-feature-600 transition-colors">
                      <span className="material-symbols-outlined text-sm">add</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="w-full md:w-1/2 p-4 flex flex-col bg-white">
            <h4 className="font-bold text-neutral-700 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">format_list_numbered</span>
              סדר הספרים במיזוג ({selectedBooksToMerge.length})
            </h4>

            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">שם הספר המאוחד החדש</label>
                <input
                  type="text"
                  value={mergedBookName}
                  onChange={(e) => setMergedBookName(e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg p-2.5 focus:ring-2 focus:ring-feature-500 outline-none text-base bg-feature-50/30"
                  placeholder="לדוגמה: אוסף כתבים מלא"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isMergedHidden}
                  onChange={(e) => setIsMergedHidden(e.target.checked)}
                  className="w-4 h-4 text-feature-600 rounded focus:ring-feature-500 border-neutral-300"
                />
                <span>הגדר את הספר המאוחד כ"מוסתר" (לא יוצג לציבור)</span>
              </label>
            </div>

            {selectedBooksToMerge.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 border-2 border-dashed border-neutral-200 rounded-xl bg-neutral-50/50 m-2">
                <span className="material-symbols-outlined text-4xl mb-2 opacity-50">playlist_add</span>
                <p className="text-sm">בחר ספרים מהרשימה מימין</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar pb-4">
                {selectedBooksToMerge.map((book, index) => (
                  <div key={book.id} className="bg-feature-50 border border-feature-100 p-3 rounded-lg flex items-center gap-3 animate-in slide-in-from-right-4 duration-300">
                    <div className="font-bold text-feature-300 text-lg w-6 text-center">{index + 1}</div>
                    <div className="flex-1 min-w-0 font-medium text-sm text-neutral-900 truncate">{book.name}</div>
                    <div className="flex items-center gap-1 bg-white rounded-lg border shadow-sm p-1">
                      <button onClick={() => moveBookOrder(index, 'up')} disabled={index === 0} className="p-1 hover:bg-neutral-100 rounded disabled:opacity-30">
                        <span className="material-symbols-outlined text-sm">arrow_upward</span>
                      </button>
                      <button onClick={() => moveBookOrder(index, 'down')} disabled={index === selectedBooksToMerge.length - 1} className="p-1 hover:bg-neutral-100 rounded disabled:opacity-30">
                        <span className="material-symbols-outlined text-sm">arrow_downward</span>
                      </button>
                      <button onClick={() => removeBookFromMergeList(book.id)} className="p-1 text-danger-500 hover:bg-danger-50 rounded">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-neutral-50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg font-medium transition-colors">ביטול</button>
          <button
            onClick={handleMergeSubmit}
            disabled={selectedBooksToMerge.length < 2 || !mergedBookName.trim() || isMerging}
            className="px-6 py-2.5 bg-feature-600 text-white rounded-lg hover:bg-feature-700 font-bold shadow-md disabled:opacity-50 flex items-center gap-2"
          >
            {isMerging ? 'מבצע מיזוג...' : 'בצע מיזוג עכשיו'}
          </button>
        </div>
      </div>
    </div>
  )
}
