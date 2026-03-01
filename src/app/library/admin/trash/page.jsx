'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDialog } from '@/components/DialogContext'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function AdminTrashPage() {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedBooks, setExpandedBooks] = useState({})
  const router = useRouter()
  const { showConfirm, showAlert } = useDialog()

  const loadTrash = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/uploads/trash')
      const data = await response.json()
      if (data.success) {
        setUploads(data.uploads)
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTrash()
  }, [])

  // פונקציה לחילוץ שם הספר הבסיסי
  const extractBaseBookName = (bookName) => {
    if (!bookName) return ''
    // Regex to remove various page number formats from the end of the string
    const pagePattern = /(?:\s*עמוד\s*\d+\s*|\s*_page_\d+\s*|\s*page\s*\d+\s*|\s*-\s*עמוד\s*\d+\s*|\s*-\s*page\s*\d+\s*)$/i
    return bookName.replace(pagePattern, '').trim()
  }

  // קיבוץ העלאות לפי ספרים
  const groupedByBook = useMemo(() => {
    const groups = {}
    
    uploads.forEach(upload => {
      const baseBookName = extractBaseBookName(upload.bookName)
      if (!groups[baseBookName]) {
        groups[baseBookName] = []
      }
      groups[baseBookName].push(upload)
    })
    
    return Object.entries(groups)
      .map(([bookName, uploads]) => ({
        bookName,
        uploads: uploads.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)),
        latestDeleted: uploads.reduce((latest, current) => 
          new Date(current.deletedAt) > new Date(latest.deletedAt) ? current : latest
        )
      }))
      .sort((a, b) => new Date(b.latestDeleted.deletedAt) - new Date(a.latestDeleted.deletedAt))
  }, [uploads])

  const toggleBookExpansion = (bookName) => {
    setExpandedBooks(prev => ({
      ...prev,
      [bookName]: !prev[bookName]
    }))
  }

  const handleRestore = async (uploadId, uploadName) => {
    showConfirm(
      'שחזור העלאה',
      `האם לשחזר את ההעלאה?\n\n"${uploadName}"`,
      async () => {
        try {
          setUploads(prev => prev.filter(u => u.id !== uploadId))

          const res = await fetch('/api/admin/uploads/restore', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId })
          })
          
          if (!res.ok) {
            loadTrash()
            showAlert('שגיאה', 'שגיאה בשחזור ההעלאה')
          }
        } catch (e) {
          loadTrash()
          showAlert('שגיאה', 'שגיאה בשחזור')
        }
      },
      'שחזר',
      'ביטול'
    )
  }

  const handlePermanentDelete = async (uploadId, uploadName) => {
    showConfirm(
      'מחיקה לצמיתות',
      `האם למחוק לצמיתות את ההעלאה?\n\n"${uploadName}"\n\nפעולה זו אינה ניתנת לביטול!`,
      async () => {
        try {
          setUploads(prev => prev.filter(u => u.id !== uploadId))

          const res = await fetch('/api/admin/uploads/permanent-delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId })
          })
          
          if (!res.ok) {
            loadTrash()
            showAlert('שגיאה', 'שגיאה במחיקת ההעלאה')
          }
        } catch (e) {
          loadTrash()
          showAlert('שגיאה', 'שגיאה במחיקה')
        }
      },
      'מחק לצמיתות',
      'ביטול'
    )
  }

  const handleEmptyTrash = async () => {
    if (uploads.length === 0) {
      showAlert('אשפה ריקה', 'האשפה ריקה')
      return
    }
    
    showConfirm(
      'ריקון אשפה',
      `האם למחוק לצמיתות ${uploads.length} העלאות?\n\nפעולה זו אינה ניתנת לביטול!`,
      async () => {
        try {
          const res = await fetch('/api/admin/uploads/empty-trash', {
            method: 'DELETE'
          })
          
          if (res.ok) {
            setUploads([])
            showAlert('הצלחה', 'האשפה רוקנה בהצלחה')
          } else {
            showAlert('שגיאה', 'שגיאה בריקון האשפה')
          }
        } catch (e) {
          showAlert('שגיאה', 'שגיאה בריקון האשפה')
        }
      },
      'רוקן אשפה',
      'ביטול'
    )
  }

  return (
    <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/library/admin/uploads"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-orange-600">delete</span>
            אשפה
          </h2>
        </div>
        
        {uploads.length > 0 && (
          <button 
            onClick={handleEmptyTrash}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-sm">delete_forever</span>
            רוקן אשפה ({uploads.length})
          </button>
        )}
      </div>
      
      {loading ? (
        <LoadingSpinner message="טוען אשפה..." />
      ) : uploads.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <span className="material-symbols-outlined text-6xl mb-2">delete_outline</span>
            <p>האשפה ריקה</p>
          </div>
      ) : (
          <div className="space-y-4">
              {groupedByBook.map(({ bookName, uploads: bookUploads }) => {
                  const isExpanded = expandedBooks[bookName]
                  const hasMultipleUploads = bookUploads.length > 1
                  const firstUpload = bookUploads[0]
                  
                  return (
                      <div key={bookName} className="glass p-5 rounded-xl border border-orange-200 hover:border-orange-300 transition-all">
                          <div 
                              className={`flex items-start gap-4 ${hasMultipleUploads ? 'cursor-pointer' : ''}`}
                              onClick={() => hasMultipleUploads && toggleBookExpansion(bookName)}
                          >
                              <div className="p-3 rounded-lg bg-orange-100 text-orange-700">
                                  <span className="material-symbols-outlined text-3xl">
                                      {hasMultipleUploads ? 'folder_delete' : 'description'}
                                  </span>
                              </div>
                              
                              <div className="flex-1">
                                  <div className="flex justify-between items-start mb-2">
                                      <div>
                                          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                              {bookName || 'ללא שם'}
                                              {hasMultipleUploads && (
                                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full border border-orange-200 font-bold">
                                                      {bookUploads.length} העלאות
                                                  </span>
                                              )}
                                          </h3>
                                          <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                              <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                נמחק ב-{new Date(firstUpload.deletedAt).toLocaleDateString('he-IL')}
                                              </span>
                                          </div>
                                      </div>
                                      
                                      <div className="flex items-center gap-2">
                                          {hasMultipleUploads && (
                                              <span className="material-symbols-outlined text-gray-400">
                                                  {isExpanded ? 'expand_less' : 'expand_more'}
                                              </span>
                                          )}
                                      </div>
                                  </div>
                                  
                                  {/* כפתורי פעולה */}
                                  <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-100">
                                      {hasMultipleUploads && (
                                          <>
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    showConfirm(
                                                        'שחזור ספר',
                                                        `האם לשחזר את כל ${bookUploads.length} ההעלאות של "${bookName}"?`,
                                                        async () => {
                                                            const uploadIds = bookUploads.map(u => u.id);
                                                            setUploads(prev => prev.filter(u => !uploadIds.includes(u.id)));
                                                            try {
                                                                const res = await fetch('/api/admin/uploads/batch-restore', {
                                                                    method: 'PUT',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ uploadIds })
                                                                });
                                                                
                                                                if (res.ok) {
                                                                    const data = await res.json();
                                                                    showAlert('הצלחה', `${data.modifiedCount} העלאות שוחזרו`);
                                                                } else {
                                                                    showAlert('שגיאה', 'שגיאה בשחזור');
                                                                    loadTrash();
                                                                }
                                                            } catch (e) {
                                                                console.error('Error restoring:', e);
                                                                showAlert('שגיאה', 'שגיאה בשחזור');
                                                                loadTrash();
                                                            }
                                                        },
                                                        'שחזר הכל',
                                                        'ביטול'
                                                    )
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-green-600 hover:bg-green-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">restore</span>
                                                  שחזר הכל ({bookUploads.length})
                                              </button>
                                              
                                              <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    showConfirm(
                                                        'מחיקה לצמיתות',
                                                        `האם למחוק לצמיתות את כל ${bookUploads.length} ההעלאות של "${bookName}"?\n\nפעולה זו אינה ניתנת לביטול!`,
                                                        async () => {
                                                            const uploadIds = bookUploads.map(u => u.id);
                                                            setUploads(prev => prev.filter(u => !uploadIds.includes(u.id)));
                                                            try {
                                                                const res = await fetch('/api/admin/uploads/batch-permanent-delete', {
                                                                    method: 'DELETE',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ uploadIds })
                                                                });
                                                                
                                                                if (res.ok) {
                                                                    const data = await res.json();
                                                                    showAlert('הצלחה', `${data.deletedCount} העלאות נמחקו לצמיתות`);
                                                                } else {
                                                                    showAlert('שגיאה', 'שגיאה במחיקה');
                                                                    loadTrash();
                                                                }
                                                            } catch (e) {
                                                                console.error('Error deleting:', e);
                                                                showAlert('שגיאה', 'שגיאה במחיקה');
                                                                loadTrash();
                                                            }
                                                        },
                                                        'מחק הכל לצמיתות',
                                                        'ביטול'
                                                    )
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">delete_forever</span>
                                                  מחק הכל לצמיתות
                                              </button>
                                          </>
                                      )}
                                      
                                      {!hasMultipleUploads && (
                                          <>
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleRestore(firstUpload.id, firstUpload.bookName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-green-600 hover:bg-green-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">restore</span>
                                                  שחזר
                                              </button>
                                              
                                              <div className="w-px h-6 bg-gray-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handlePermanentDelete(firstUpload.id, firstUpload.bookName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-lg">delete_forever</span>
                                                  מחק לצמיתות
                                              </button>
                                          </>
                                      )}
                                  </div>
                              </div>
                          </div>
                          
                          {hasMultipleUploads && isExpanded && (
                              <div className="mt-4 mr-16 space-y-3 border-r-2 border-orange-300 pr-4">
                                  {bookUploads.map(upload => (
                                      <div key={upload.id} className="bg-white/50 p-4 rounded-lg border border-gray-200">
                                          <div className="flex justify-between items-start mb-2">
                                              <div className="flex-1">
                                                  <h4 className="font-semibold text-gray-800">
                                                      {upload.bookName}
                                                  </h4>
                                                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                                                      <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">person</span>
                                                        {upload.uploadedBy || 'אורח'}
                                                      </span>
                                                      <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">delete</span>
                                                        {new Date(upload.deletedAt).toLocaleDateString('he-IL')}
                                                      </span>
                                                  </div>
                                              </div>
                                          </div>
                                          
                                          <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-gray-100">
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleRestore(upload.id, upload.bookName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-green-600 hover:bg-green-50 rounded-lg text-xs transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-sm">restore</span>
                                                  שחזר
                                              </button>
                                              
                                              <div className="w-px h-5 bg-gray-300 mx-1"></div>
                                              
                                              <button 
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handlePermanentDelete(upload.id, upload.bookName)
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-xs transition-colors"
                                              >
                                                  <span className="material-symbols-outlined text-sm">delete_forever</span>
                                                  מחק לצמיתות
                                              </button>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  )
              })}
          </div>
      )}
    </div>
  )
}
