'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDialog } from '@/components/providers/DialogContext'
import { useLoading } from '@/components/providers/LoadingContext'
import SplitBookDialog from '@/components/admin/SplitBookDialog'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AdminTableShell from '@/components/admin/AdminTableShell'
import { hasBooksAccess } from '@/lib/roles'
import { formatDateFull } from '@/lib/formatDate'
import { getDateTimestamp, computeStatusCounts, filterBooksByStatus, sortBooks, getSortIcon } from './dictaBooksLogic'
import DictaStatusBadge from './DictaStatusBadge'
import CreateDictaBookModal from './CreateDictaBookModal'
import EditDictaBookStatusModal from './EditDictaBookStatusModal'

function formatHebrewDate(value) {
  const timestamp = getDateTimestamp(value)
  if (timestamp === null) return '-'

  return formatDateFull(timestamp)
}

export default function AdminDictaBooksClient({ initialBooks }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()
  const { startLoading, stopLoading } = useLoading()

  const [books, setBooks] = useState(initialBooks || [])
  const [loading, setLoading] = useState(false) // טעינת נתונים ראשונית — כבר הגיעה מהשרת
  const [syncing, setSyncing] = useState(false) // סטטוס סנכרון
  
  const [newBookTitle, setNewBookTitle] = useState('')
  const [newBookContent, setNewBookContent] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  const [editingBook, setEditingBook] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  
  const [splittingBook, setSplittingBook] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null) // לניהול תפריט פתוח
  
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [statusFilter, setStatusFilter] = useState('all') // ברירת מחדל: הכל

  // 1. בדיקת הרשאות והפניה
  useEffect(() => {
    if (status === 'loading') return
    
    if (status === 'unauthenticated') {
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
    } else if (!hasBooksAccess(session?.user?.role)) {
      router.push('/library/dashboard')
    }
    // אין צורך ב-loadBooks() כאן: רשימת הספרים הראשונית מגיעה כבר מהשרת
    // (initialBooks); בדיקת ההרשאה כאן היא הגנת-עומק בלבד, מכיוון ש-proxy.js
    // כבר חוסם גישה לעמוד זה למי שאינו מנהל.
  }, [status, session, router])

  const loadBooks = async () => {
    try {
      // מציג מסך טעינה רק אם אין עדיין נתונים
      if (books.length === 0) setLoading(true)
      
      const response = await fetch('/api/dicta/books')
      if (response.ok) {
        const data = await response.json()
        setBooks(data)
      }
    } catch (error) {
      console.error('Error loading dicta books:', error)
    } finally {
      setLoading(false)
    }
  }

  // 2. לוגיקת סנכרון מול GitHub
  const handleSync = async () => {
    showConfirm(
      'סנכרון ספרים',
      'האם לסנכרן ספרים מ-GitHub? הפעולה עשויה לקחת זמן.',
      async () => {
        setSyncing(true)
        try {
          const response = await fetch('/api/dicta/tools', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool: 'dicta-sync' })
          })

          const data = await response.json()

          if (response.ok && data.success) {
            const summary = data.log.length > 0 
                ? data.log.join('\n') 
                : 'הסנכרון הסתיים, לא היו שינויים.'
                
            showAlert('הסנכרון הושלם', `${summary}`)
            loadBooks() // טעינה ברקע ללא מסך טעינה

            // אם נוספו מעל 10 ספרים, שאל אם לשלוח הודעה
            const addedCount = data.addedCount || 0
            if (addedCount > 10) {
              showConfirm(
                'שליחת הודעה למנויים',
                `נוספו ${addedCount} ספרים חדשים. האם לשלוח הודעה למנויים על הספרים החדשים?`,
                async () => {
                  try {
                    const emailResponse = await fetch('/api/admin/send-dicta-sync-notification', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ addedCount })
                    })

                    const emailData = await emailResponse.json()
                    
                    if (emailData.success) {
                      showAlert('הצלחה', `ההודעה נשלחה בהצלחה ל-${emailData.details?.successful || 0} מנויים`)
                    } else {
                      showAlert('שגיאה', `שגיאה בשליחת ההודעה: ${emailData.error || 'שגיאה לא ידועה'}`)
                    }
                  } catch (emailError) {
                    console.error(emailError)
                    showAlert('שגיאה', 'שגיאה בשליחת ההודעה למנויים')
                  }
                }
              )
            }
          } else {
            showAlert('שגיאה', `שגיאה בסנכרון: ${data.detail || data.error || 'שגיאה לא ידועה'}`)
          }
        } catch (e) {
          console.error(e)
          showAlert('שגיאה', 'שגיאת תקשורת בעת ביצוע הסנכרון')
        } finally {
          setSyncing(false)
        }
      }
    )
  }

  const handleCreateBook = async () => {
    if (!newBookTitle.trim()) {
      showAlert('שגיאה', 'נא להזין שם לספר')
      return
    }
    
    try {
      const response = await fetch('/api/dicta/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: newBookTitle,
          content: newBookContent
        })
      })
      
      if (response.ok) {
        setNewBookTitle('')
        setNewBookContent('')
        setShowCreateForm(false)
        loadBooks() // טעינה ברקע ללא מסך טעינה
        showAlert('הצלחה', 'הספר נוצר בהצלחה!')
      } else {
        const data = await response.json()
        showAlert('שגיאה', data.error || 'שגיאה ביצירת הספר')
      }
    } catch (e) {
      showAlert('שגיאה', 'שגיאה ביצירת הספר')
    }
  }

  const handleDeleteBook = async (bookId, bookTitle) => {
    showConfirm(
      'מחיקת ספר',
      `האם אתה בטוח שברצונך למחוק את הספר "${bookTitle}"?`,
      async () => {
        try {
          const response = await fetch(`/api/dicta/books/${bookId}`, {
            method: 'DELETE'
          })
          
          if (response.ok) {
            setBooks(prev => prev.filter(b => b._id !== bookId))
            showAlert('הצלחה', 'הספר נמחק בהצלחה!')
          } else {
            showAlert('שגיאה', 'שגיאה במחיקת הספר')
          }
        } catch (e) {
          showAlert('שגיאה', 'שגיאה במחיקת הספר')
        }
      }
    )
  }

  const handleReleaseBook = async (bookId, bookTitle) => {
    showConfirm(
      'שחרור ספר',
      `האם אתה בטוח שברצונך לשחרר את הספר "${bookTitle}"? משתמשים אחרים יוכלו לתפוס אותו לעריכה.`,
      async () => {
        try {
          const response = await fetch(`/api/dicta/books/${bookId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'release' })
          })
          
          if (response.ok) {
            loadBooks() // טעינה ברקע ללא מסך טעינה
            showAlert('הצלחה', 'הספר שוחרר בהצלחה!')
          } else {
            showAlert('שגיאה', 'שגיאה בשחרור הספר')
          }
        } catch (e) {
          showAlert('שגיאה', 'שגיאה בשחרור הספר')
        }
      }
    )
  }

  const handleEditStatus = (book) => {
    setEditingBook(book)
    setEditStatus(book.status)
  }

  const handleSaveStatus = async () => {
    if (!editingBook) return
    
    try {
      const response = await fetch(`/api/dicta/books/${editingBook._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus })
      })
      
      if (response.ok) {
        loadBooks() // טעינה ברקע ללא מסך טעינה
        setEditingBook(null)
        showAlert('הצלחה', 'הסטטוס עודכן בהצלחה!')
      } else {
        showAlert('שגיאה', 'שגיאה בעדכון הסטטוס')
      }
    } catch (e) {
      showAlert('שגיאה', 'שגיאה בעדכון הסטטוס')
    }
  }

  const handleSplitBook = async (book) => {
    try {
      startLoading('טוען תוכן הספר...')
      const response = await fetch(`/api/dicta/books/${book._id}`)
      if (!response.ok) {
        showAlert('שגיאה', 'שגיאה בטעינת תוכן הספר')
        return
      }
      
      const fullBook = await response.json()
      setSplittingBook(fullBook)
    } catch (error) {
      console.error('Error loading book content:', error)
      showAlert('שגיאה', 'שגיאה בטעינת תוכן הספר')
    } finally {
      stopLoading()
    }
  }

  const handleSplitSuccess = () => {
    loadBooks()
  }

  const toggleMenu = (bookId) => {
    setOpenMenuId(openMenuId === bookId ? null : bookId)
  }

  // סגירת תפריט בלחיצה מחוץ לו
  useEffect(() => {
    const handleClickOutside = () => setOpenMenuId(null)
    if (openMenuId) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openMenuId])

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  // חישוב כמויות לפי סטטוס במעבר אחד על המערך
  const statusCounts = useMemo(() => computeStatusCounts(books), [books])

  // סינון לפי סטטוס
  const filteredBooks = filterBooksByStatus(books, statusFilter)

  const sortedBooks = sortBooks(filteredBooks, sortConfig)

  // אם עדיין בודקים הרשאות או המשתמש לא אדמין
  if (status === 'loading') return <LoadingSpinner message="" />

  if (!hasBooksAccess(session?.user?.role)) return null;

  return (
    <>
      <div className="glass-strong p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between mb-8 gap-4">
        <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">edit_document</span>
          ניהול ספרי דיקטה
        </h2>
        
        <div className="flex gap-3">
            {/* כפתור סנכרון חדש */}
            <button 
                onClick={handleSync}
                disabled={syncing}
                className="bg-aqua-600 text-white px-4 py-2 rounded-lg hover:bg-aqua-700 transition flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
            >
                {syncing ? (
                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                ) : (
                    <span className="material-symbols-outlined text-sm">cloud_sync</span>
                )}
                {syncing ? 'מסנכרן...' : 'סנכרון מ-GitHub'}
            </button>

            <button 
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="bg-primary text-on-primary px-4 py-2 rounded-lg hover:bg-primary/90 transition flex items-center gap-2 shadow-sm"
            >
                <span className="material-symbols-outlined text-sm">add</span>
                הוסף ספר חדש
            </button>
        </div>
      </div>

      {/* טופס יצירת ספר - חלון קופץ */}

      {/* כפתורי סינון */}
      <div className="mb-4 flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          הכל ({statusCounts.total})
        </button>
        <button
          onClick={() => setStatusFilter('available')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'available'
              ? 'bg-success-600 text-white shadow-sm'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          פנוי ({statusCounts.available})
        </button>
        <button
          onClick={() => setStatusFilter('in-progress')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'in-progress'
              ? 'bg-warning-strong-600 text-white shadow-sm'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          בטיפול ({statusCounts.inProgress})
        </button>
        <button
          onClick={() => setStatusFilter('completed')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'completed'
              ? 'bg-info-600 text-white shadow-sm'
              : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
          }`}
        >
          הושלם ({statusCounts.completed})
        </button>
      </div>

      {/* רשימת ספרים */}
      {loading ? (
        <LoadingSpinner message="טוען ספרים..." />
      ) : filteredBooks.length === 0 ? (
        <div className="text-center py-12 text-on-surface/60 border-2 border-dashed border-neutral-300 rounded-xl">
          <span className="material-symbols-outlined text-6xl mb-4 block opacity-50">library_books</span>
          {books.length === 0 ? (
            <>
              <p className="text-lg font-medium">אין ספרי דיקטה במערכת</p>
              <p className="text-sm mt-2">לחץ על "סנכרון מ-GitHub" לייבוא ספרים או "הוסף ספר חדש"</p>
            </>
          ) : (
            <p className="text-lg font-medium">אין ספרים בסטטוס זה</p>
          )}
        </div>
      ) : (
        <AdminTableShell>
          <table className="w-full bg-white">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-700 text-sm">
                <th 
                  onClick={() => handleSort('title')}
                  className="text-right p-4 font-bold cursor-pointer hover:bg-neutral-200 select-none"
                >
                  שם הספר {getSortIcon(sortConfig, 'title')}
                </th>
                <th 
                  onClick={() => handleSort('status')}
                  className="text-right p-4 font-bold cursor-pointer hover:bg-neutral-200 select-none"
                >
                  סטטוס {getSortIcon(sortConfig, 'status')}
                </th>
                <th 
                  onClick={() => handleSort('claimedBy')}
                  className="text-right p-4 font-bold cursor-pointer hover:bg-neutral-200 select-none"
                >
                  נערך ע"י {getSortIcon(sortConfig, 'claimedBy')}
                </th>
                <th 
                  onClick={() => handleSort('updatedAt')}
                  className="text-right p-4 font-bold cursor-pointer hover:bg-neutral-200 select-none"
                >
                  עדכון אחרון {getSortIcon(sortConfig, 'updatedAt')}
                </th>
                <th className="text-center p-4 font-bold">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {sortedBooks.map(book => (
                <tr key={book._id} className="hover:bg-neutral-50 transition-colors">
                  <td className="p-4 font-medium text-neutral-900">{book.title}</td>
                  <td className="p-4"><DictaStatusBadge status={book.status} /></td>
                  <td className="p-4 text-sm">{book.claimedBy?.name || '-'}</td>
                  <td className="p-4 text-sm text-neutral-500">
                    {formatHebrewDate(book.updatedAt)}
                  </td>
                  <td className="p-4">
                    <div className="flex justify-center relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleMenu(book._id)
                        }}
                        className={`p-2 hover:bg-neutral-200 rounded-lg transition-colors ${
                          openMenuId === book._id ? 'bg-neutral-200' : ''
                        }`}
                        title="פעולות"
                      >
                        <span className="material-symbols-outlined text-neutral-600">more_vert</span>
                      </button>

                      {openMenuId === book._id && (
                        <div 
                          className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-50 min-w-[180px] animate-in fade-in slide-in-from-top-2 duration-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setOpenMenuId(null)
                              router.push(`/library/dicta-books/edit/${book._id}`)
                            }}
                            className="w-full px-4 py-2 text-right hover:bg-neutral-50 transition-colors flex items-center gap-2 text-sm"
                          >
                            <span className="material-symbols-outlined text-success-600 text-base">edit_note</span>
                            <span>פתח בעורך</span>
                          </button>

                          {book.status !== 'completed' && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null)
                                handleSplitBook(book)
                              }}
                              className="w-full px-4 py-2 text-right hover:bg-neutral-50 transition-colors flex items-center gap-2 text-sm"
                            >
                              <span className="material-symbols-outlined text-feature-600 text-base">call_split</span>
                              <span>פצל ספר ל-2</span>
                            </button>
                          )}

                          {book.status === 'in-progress' && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null)
                                handleReleaseBook(book._id, book.title)
                              }}
                              className="w-full px-4 py-2 text-right hover:bg-neutral-50 transition-colors flex items-center gap-2 text-sm"
                            >
                              <span className="material-symbols-outlined text-warning-strong-600 text-base">lock_open</span>
                              <span>שחרר ספר</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setOpenMenuId(null)
                              handleEditStatus(book)
                            }}
                            className="w-full px-4 py-2 text-right hover:bg-neutral-50 transition-colors flex items-center gap-2 text-sm"
                          >
                            <span className="material-symbols-outlined text-info-600 text-base">edit</span>
                            <span>ערוך סטטוס</span>
                          </button>

                          <div className="border-t border-neutral-200 my-1"></div>

                          <button
                            onClick={() => {
                              setOpenMenuId(null)
                              handleDeleteBook(book._id, book.title)
                            }}
                            className="w-full px-4 py-2 text-right hover:bg-danger-50 transition-colors flex items-center gap-2 text-sm text-danger-600"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                            <span>מחק ספר</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableShell>
      )}
    </div>
      
    {/* חלון קופץ ליצירת ספר חדש */}
    {showCreateForm && (
      <CreateDictaBookModal
        title={newBookTitle}
        content={newBookContent}
        onTitleChange={setNewBookTitle}
        onContentChange={setNewBookContent}
        onClose={() => setShowCreateForm(false)}
        onCreate={handleCreateBook}
      />
    )}

    {editingBook && (
      <EditDictaBookStatusModal
        book={editingBook}
        status={editStatus}
        onStatusChange={setEditStatus}
        onClose={() => setEditingBook(null)}
        onSave={handleSaveStatus}
      />
    )}

    {splittingBook && (
      <SplitBookDialog
        book={splittingBook}
        onClose={() => setSplittingBook(null)}
        onSuccess={handleSplitSuccess}
      />
    )}
    </>
  )
}

