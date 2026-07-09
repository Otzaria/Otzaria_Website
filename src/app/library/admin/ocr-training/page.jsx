'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useDialog } from '@/components/providers/DialogContext'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function AdminOcrTrainingPage() {
  const [pages, setPages] = useState([])
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  // בורר הוספה
  const [bookSearch, setBookSearch] = useState('')
  const [showBookMenu, setShowBookMenu] = useState(false)
  const [selectedBook, setSelectedBook] = useState(null)
  const [pageNumber, setPageNumber] = useState('')
  const [scriptType, setScriptType] = useState('square')

  const { showAlert, showConfirm } = useDialog()

  const loadPages = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/ocr-training')
      const data = await res.json()
      if (data.success) setPages(data.pages)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadBooks = async () => {
    try {
      const res = await fetch('/api/admin/ocr-training/books')
      const data = await res.json()
      if (data.success) setBooks(data.books)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadPages()
    loadBooks()
  }, [])

  useEffect(() => {
    const onClick = (e) => {
      if (showBookMenu && !e.target.closest('.book-picker')) setShowBookMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showBookMenu])

  const filteredBooks = useMemo(
    () => books.filter((b) => b.name.toLowerCase().includes(bookSearch.toLowerCase())),
    [books, bookSearch]
  )

  const handleAdd = async () => {
    if (!selectedBook) return showAlert('שגיאה', 'יש לבחור ספר')
    const n = parseInt(pageNumber)
    if (!Number.isInteger(n) || n < 1) return showAlert('שגיאה', 'יש להזין מספר עמוד תקין')
    if (selectedBook.totalPages && n > selectedBook.totalPages)
      return showAlert('שגיאה', `לספר יש ${selectedBook.totalPages} עמודים בלבד`)

    setAdding(true)
    try {
      const res = await fetch('/api/admin/ocr-training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: selectedBook.id, pageNumber: n, scriptType }),
      })
      const data = await res.json()
      if (data.success) {
        setPageNumber('')
        loadPages()
      } else {
        showAlert('שגיאה', data.error || 'שגיאה בהוספת העמוד')
      }
    } catch (e) {
      showAlert('שגיאה', 'תקלה בתקשורת')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = (page) => {
    showConfirm('מחיקת עמוד', `למחוק את "${page.bookName}" עמוד ${page.pageNumber} מהמאגר? כל השורות המסומנות יימחקו.`, async () => {
      try {
        const res = await fetch(`/api/admin/ocr-training/${page.id}`, { method: 'DELETE' })
        if (res.ok) loadPages()
        else showAlert('שגיאה', 'שגיאה במחיקה')
      } catch {
        showAlert('שגיאה', 'תקלה בתקשורת')
      }
    })
  }

  const handleRelease = (page) => {
    showConfirm('שחרור עמוד', 'לשחרר את שיוך המשתמש לעמוד זה?', async () => {
      try {
        await fetch(`/api/admin/ocr-training/${page.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'release' }),
        })
        loadPages()
      } catch {
        showAlert('שגיאה', 'תקלה בתקשורת')
      }
    })
  }

  const handleDownloadAll = (status) => {
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    const link = document.createElement('a')
    link.href = `/api/admin/ocr-training/export?${params.toString()}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const totals = useMemo(() => {
    const filledLines = pages.reduce((s, p) => s + (p.filledLines || 0), 0)
    const completed = pages.filter((p) => p.status === 'completed').length
    return { pages: pages.length, filledLines, completed }
  }, [pages])

  const statusBadge = (status) => {
    const map = {
      completed: ['bg-success-100 text-success-800', 'check_circle', 'הושלם'],
      'in-progress': ['bg-info-100 text-info-800', 'edit', 'בטיפול'],
      available: ['bg-neutral-100 text-neutral-600', 'lock_open', 'זמין'],
    }
    const [cls, icon, label] = map[status] || map.available
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1 ${cls}`}>
        <span className="material-symbols-outlined text-xs">{icon}</span>
        {label}
      </span>
    )
  }

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">model_training</span>
          מאגר אימון OCR
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => handleDownloadAll('')}
            className="bg-aqua-600 hover:bg-aqua-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            title="הורדת כל השורות המסומנות כ-ZIP בפורמט אימון (manifest + חיתוכים)"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            הורד הכל (ZIP)
          </button>
          <button
            onClick={() => handleDownloadAll('completed')}
            className="bg-success-600 hover:bg-success-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            title="הורדת עמודים שהושלמו בלבד"
          >
            <span className="material-symbols-outlined text-sm">download_done</span>
            הושלמו בלבד
          </button>
        </div>
      </div>

      {/* סטטיסטיקה */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-surface/50 border border-surface-variant rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-primary">{totals.pages}</div>
          <div className="text-sm text-neutral-500">עמודים במאגר</div>
        </div>
        <div className="bg-surface/50 border border-surface-variant rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-success-600">{totals.completed}</div>
          <div className="text-sm text-neutral-500">הושלמו</div>
        </div>
        <div className="bg-surface/50 border border-surface-variant rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-info-600">{totals.filledLines}</div>
          <div className="text-sm text-neutral-500">שורות עם טקסט</div>
        </div>
      </div>

      {/* הוספת עמוד */}
      <div className="bg-surface/50 p-4 rounded-xl border border-surface-variant mb-6">
        <h3 className="font-bold text-neutral-700 mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">add_circle</span>
          הוספת עמוד למאגר
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* בורר ספר */}
          <div className="md:col-span-6 flex flex-col relative book-picker">
            <label className="text-sm font-bold text-neutral-700 mb-1">ספר (כולל מוסתרים)</label>
            <button
              onClick={() => setShowBookMenu((v) => !v)}
              className="border p-2 rounded-lg bg-white h-[42px] text-right flex items-center justify-between"
            >
              <span className="material-symbols-outlined text-sm">expand_more</span>
              <span className="flex-1 truncate">
                {selectedBook ? (
                  <span className="flex items-center gap-1 justify-end">
                    {selectedBook.isHidden && (
                      <span className="material-symbols-outlined text-xs text-warning-alt-600">visibility_off</span>
                    )}
                    {selectedBook.name}
                  </span>
                ) : (
                  'בחר ספר...'
                )}
              </span>
            </button>
            {showBookMenu && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-neutral-200 rounded-lg shadow-lg z-20 max-h-72 overflow-hidden flex flex-col">
                <input
                  type="text"
                  placeholder="חיפוש ספר..."
                  value={bookSearch}
                  onChange={(e) => setBookSearch(e.target.value)}
                  className="p-2 border-b border-neutral-200 focus:outline-none"
                  autoFocus
                />
                <div className="overflow-y-auto">
                  {filteredBooks.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => {
                        setSelectedBook(b)
                        setShowBookMenu(false)
                        setBookSearch('')
                      }}
                      className="p-2 hover:bg-neutral-100 cursor-pointer text-sm flex items-center justify-between gap-2"
                    >
                      <span className="text-xs text-neutral-400">{b.totalPages} עמ׳</span>
                      <span className="flex items-center gap-1 flex-1 justify-end truncate">
                        {b.isHidden && (
                          <span className="material-symbols-outlined text-xs text-warning-alt-600">visibility_off</span>
                        )}
                        {b.name}
                      </span>
                    </div>
                  ))}
                  {filteredBooks.length === 0 && (
                    <div className="p-3 text-center text-sm text-neutral-400">לא נמצאו ספרים</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2 flex flex-col">
            <label className="text-sm font-bold text-neutral-700 mb-1">מספר עמוד</label>
            <input
              type="number"
              min="1"
              value={pageNumber}
              onChange={(e) => setPageNumber(e.target.value)}
              className="border p-2 rounded-lg bg-white h-[42px]"
              placeholder="לדוגמה 5"
            />
          </div>

          <div className="md:col-span-2 flex flex-col">
            <label className="text-sm font-bold text-neutral-700 mb-1">סוג כתב</label>
            <select
              value={scriptType}
              onChange={(e) => setScriptType(e.target.value)}
              className="border p-2 rounded-lg bg-white h-[42px]"
            >
              <option value="square">מרובע</option>
              <option value="rashi">רש״י</option>
            </select>
          </div>

          <div className="md:col-span-2 flex flex-col">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="bg-primary hover:opacity-90 text-on-primary font-bold px-4 rounded-lg transition-all h-[42px] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              הוסף
            </button>
          </div>
        </div>
      </div>

      {/* טבלת עמודים */}
      {loading ? (
        <LoadingSpinner message="טוען עמודים..." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full bg-white">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="text-right p-4 font-bold text-neutral-700">ספר</th>
                <th className="text-right p-4 font-bold text-neutral-700">עמוד</th>
                <th className="text-right p-4 font-bold text-neutral-700">כתב</th>
                <th className="text-right p-4 font-bold text-neutral-700">סטטוס</th>
                <th className="text-right p-4 font-bold text-neutral-700">שורות</th>
                <th className="text-right p-4 font-bold text-neutral-700">משתמש</th>
                <th className="text-right p-4 font-bold text-neutral-700">עודכן</th>
                <th className="text-right p-4 font-bold text-neutral-700">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b hover:bg-neutral-50 transition-colors">
                  <td className="p-4 font-medium">{p.bookName}</td>
                  <td className="p-4">{p.pageNumber}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-700">
                      {p.scriptType === 'rashi' ? 'רש״י' : 'מרובע'}
                    </span>
                  </td>
                  <td className="p-4">{statusBadge(p.status)}</td>
                  <td className="p-4 text-sm">
                    <span className={p.filledLines >= p.targetLines ? 'text-success-600 font-bold' : 'text-neutral-600'}>
                      {p.filledLines}/{p.targetLines}
                    </span>
                    {p.markedLines > p.filledLines && (
                      <span className="text-xs text-neutral-400"> ({p.markedLines} מסומנות)</span>
                    )}
                  </td>
                  <td className="p-4 text-sm">{p.claimedByName || '-'}</td>
                  <td className="p-4 text-sm text-neutral-500">
                    {new Date(p.updatedAt || p.createdAt).toLocaleDateString('he-IL')}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-1">
                      <Link
                        href={`/library/ocr-training/${p.id}`}
                        className="text-info-600 hover:bg-info-50 p-1.5 rounded-lg transition-colors"
                        title="פתח / צפה בסימון"
                      >
                        <span className="material-symbols-outlined">visibility</span>
                      </Link>
                      {p.status !== 'available' && (
                        <button
                          onClick={() => handleRelease(p)}
                          className="text-warning-strong-600 hover:bg-warning-strong-50 p-1.5 rounded-lg transition-colors"
                          title="שחרר שיוך"
                        >
                          <span className="material-symbols-outlined">lock_open</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(p)}
                        className="text-danger-600 hover:bg-danger-50 p-1.5 rounded-lg transition-colors"
                        title="מחק"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pages.length === 0 && (
            <div className="text-center py-10 text-neutral-500">
              <p>המאגר ריק. הוסף עמודים בעזרת הטופס למעלה.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
