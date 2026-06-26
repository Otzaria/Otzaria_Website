'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '@/components/providers/DialogContext'

export default function EditBookInfoDialog({ book, onClose, onSave }) {
  const { showAlert } = useDialog()
  const [title, setTitle] = useState('הנחיות עריכה')
  const [sections, setSections] = useState([
    { title: 'כללי', items: [''] }
  ])
  const [saving, setSaving] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  const [examplePage, setExamplePage] = useState(null)
  const [totalPages, setTotalPages] = useState(0)
  const [showPageMenu, setShowPageMenu] = useState(false)
  const pageMenuRef = useRef(null)

  useEffect(() => {
    setMounted(true)
    document.body.style.overflow = 'hidden'

    if (book) {
        if (book.editingInfo) {
            setTitle(book.editingInfo.title || 'הנחיות עריכה')
            setSections(book.editingInfo.sections || [{ title: 'כללי', items: [''] }])
        }
        
        setTotalPages(book.totalPages || 0)
        if (book.examplePage !== undefined) {
            setExamplePage(book.examplePage)
        }

        const fetchBookDetails = async () => {
            if (book.path) {
                try {
                    const response = await fetch(`/api/book/${encodeURIComponent(book.path)}`)
                    const data = await response.json()
                    
                    if (data.success && data.book) {
                        setTotalPages(data.book.totalPages || 0)
                        
                        if (data.book.examplePage !== undefined) {
                            setExamplePage(data.book.examplePage)
                        } else {
                            console.warn('השדה examplePage לא הוחזר מהשרת. בדוק את ה-API של שליפת הספר.')
                        }
                    }
                } catch (error) {
                    console.error('Failed to fetch fresh book details:', error)
                }
            }
        }
        fetchBookDetails()
    }

    return () => { document.body.style.overflow = 'unset' }
  }, [book])

  useEffect(() => {
    const handleClickOutside = (event) => {
        if (pageMenuRef.current && !pageMenuRef.current.contains(event.target)) {
            setShowPageMenu(false)
        }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!book || !mounted) return null

  const addSection = () => setSections([...sections, { title: '', items: [''] }])
  const removeSection = (index) => setSections(sections.filter((_, i) => i !== index))
  const updateSectionTitle = (index, newTitle) => {
    const newSections = [...sections]
    newSections[index].title = newTitle
    setSections(newSections)
  }
  const addItem = (sectionIndex) => {
    const newSections = [...sections]
    newSections[sectionIndex].items.push('')
    setSections(newSections)
  }
  const removeItem = (sectionIndex, itemIndex) => {
    const newSections = [...sections]
    newSections[sectionIndex].items = newSections[sectionIndex].items.filter((_, i) => i !== itemIndex)
    setSections(newSections)
  }
  const updateItem = (sectionIndex, itemIndex, newValue) => {
    const newSections = [...sections]
    newSections[sectionIndex].items[itemIndex] = newValue
    setSections(newSections)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const editingInfo = {
        title,
        sections: sections.filter(s => s.title && s.items.some(i => i.trim()))
      }

      const response = await fetch('/api/book/update-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: book.id || book._id, 
          editingInfo,
          examplePage
        })
      })

      const result = await response.json()

      if (result.success) {
        showAlert('הצלחה', 'המידע נשמר בהצלחה!')
        onSave()
        onClose()
      } else {
        showAlert('שגיאה', result.error || 'שגיאה בשמירה')
      }
    } catch (error) {
      console.error('Error saving book info:', error)
      showAlert('שגיאה', 'שגיאה בשמירת המידע')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="flex flex-col bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-neutral-100 flex-shrink-0">
          <h2 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-info-600 text-3xl">edit_note</span>
            <span>עריכת מידע - {book.name}</span>
          </h2>
          
          <div className="flex items-center gap-3">
            {/* כפתור ותפריט הגדרת עמוד דוגמא */}
            <div className="relative" ref={pageMenuRef}>
                <button
                    onClick={() => setShowPageMenu(!showPageMenu)}
                    className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-colors text-sm font-bold ${
                        examplePage 
                        ? 'bg-info-alt-50 text-info-alt-700 border-info-alt-200 hover:bg-info-alt-100' 
                        : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                    }`}
                    title="הגדר עמוד דוגמא שיוצג למשתמשים"
                >
                    <span className="material-symbols-outlined text-lg">
                        {examplePage ? 'bookmark' : 'bookmark_add'}
                    </span>
                    <span>
                        {examplePage ? `עמוד דוגמא: ${examplePage}` : 'הגדר עמוד דוגמא'}
                    </span>
                    <span className="material-symbols-outlined text-sm">arrow_drop_down</span>
                </button>

                {showPageMenu && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-neutral-100 overflow-hidden z-[60] animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 border-b border-neutral-50 bg-neutral-50/50">
                            <span className="text-xs font-bold text-neutral-500">בחר עמוד (סה"כ {totalPages})</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                            <button
                                onClick={() => {
                                    setExamplePage(null)
                                    setShowPageMenu(false)
                                }}
                                className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors mb-1 ${
                                    examplePage === null ? 'bg-info-alt-50 text-info-alt-700 font-bold' : 'hover:bg-neutral-50 text-neutral-700'
                                }`}
                            >
                                ללא עמוד דוגמא
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(num => (
                                <button
                                    key={num}
                                    onClick={() => {
                                        setExamplePage(num)
                                        setShowPageMenu(false)
                                    }}
                                    className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors ${
                                        examplePage === num ? 'bg-info-alt-50 text-info-alt-700 font-bold' : 'hover:bg-neutral-50 text-neutral-700'
                                    }`}
                                >
                                    עמוד {num}
                                </button>
                            ))}
                            {totalPages === 0 && (
                                <div className="p-3 text-center text-xs text-neutral-400">
                                    אין עמודים בספר זה
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <button
                onClick={onClose}
                className="text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 p-2 rounded-full transition-colors"
            >
                <span className="material-symbols-outlined text-2xl block">close</span>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-neutral-900 mb-2">
                כותרת ראשית
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500 focus:border-transparent"
                placeholder="לדוגמה: הנחיות עריכה - תלמוד"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-bold text-neutral-900">
                  סעיפים
                </label>
                <button
                  onClick={addSection}
                  className="flex items-center gap-1 px-4 py-2 bg-info-50 text-info-700 rounded-lg hover:bg-info-100 transition-colors text-sm font-bold"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  <span>הוסף סעיף</span>
                </button>
              </div>

              <div className="space-y-4">
                {sections.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 transition-all hover:border-info-200 hover:shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => updateSectionTitle(sectionIndex, e.target.value)}
                        className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500 bg-white font-medium"
                        placeholder="כותרת הסעיף (לדוגמה: כללי, תיוג, שמירה)"
                      />
                      <button
                        onClick={() => removeSection(sectionIndex)}
                        className="p-2 text-danger-600 hover:bg-danger-100 rounded-lg transition-colors"
                        title="מחק סעיף"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>

                    <div className="space-y-2 pr-4 border-r-2 border-neutral-200">
                      {section.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm text-neutral-400">arrow_left</span>
                          <input
                            type="text"
                            value={item}
                            onChange={(e) => updateItem(sectionIndex, itemIndex, e.target.value)}
                            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-info-500 bg-white text-sm"
                            placeholder="הנחיה..."
                          />
                          <button
                            onClick={() => removeItem(sectionIndex, itemIndex)}
                            className="p-1.5 text-neutral-400 hover:text-danger-600 hover:bg-danger-50 rounded transition-colors"
                            title="מחק הנחיה"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addItem(sectionIndex)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-info-600 hover:bg-info-50 rounded-lg transition-colors mt-2"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        <span>הוסף הנחיה</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl flex-shrink-0">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-info-600 text-white rounded-lg hover:bg-info-700 transition-colors font-bold disabled:opacity-70 shadow-md hover:-translate-y-0.5 transform"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                <span>שומר...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">save</span>
                <span>שמור שינויים</span>
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors font-medium"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
