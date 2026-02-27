'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDialog } from '@/components/DialogContext'
import { useLoading } from '@/components/LoadingContext'

export default function AdminDictaBooksPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()
  const { startLoading, stopLoading } = useLoading()

  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true) // טעינת נתונים ראשונית
  const [syncing, setSyncing] = useState(false) // סטטוס סנכרון
  
  const [newBookTitle, setNewBookTitle] = useState('')
  const [newBookContent, setNewBookContent] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  const [editingBook, setEditingBook] = useState(null)
  const [editStatus, setEditStatus] = useState('')
  
  const [splittingBook, setSplittingBook] = useState(null)
  const [splitPosition, setSplitPosition] = useState(0)
  const [firstBookTitle, setFirstBookTitle] = useState('')
  const [secondBookTitle, setSecondBookTitle] = useState('')
  const [splitting, setSplitting] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [viewMode, setViewMode] = useState('preview') // 'preview' or 'full'
  
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' })
  const [statusFilter, setStatusFilter] = useState('all') // ברירת מחדל: הכל

  // 1. בדיקת הרשאות והפניה
  useEffect(() => {
    if (status === 'loading') return
    
    if (status === 'unauthenticated') {
      router.push('/library/auth/login')
    } else if (session?.user?.role !== 'admin') {
      router.push('/library/dashboard')
    } else {
      loadBooks()
    }
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
      // טעינת התוכן המלא של הספר
      const response = await fetch(`/api/dicta/books/${book._id}`)
      if (!response.ok) {
        showAlert('שגיאה', 'שגיאה בטעינת תוכן הספר')
        return
      }
      
      const fullBook = await response.json()
      setSplittingBook(fullBook)
      setSplitPosition(Math.floor((fullBook.content?.length || 0) / 2))
      setFirstBookTitle(`${fullBook.title} - חלק א`)
      setSecondBookTitle(`${fullBook.title} - חלק ב`)
    } catch (error) {
      console.error('Error loading book content:', error)
      showAlert('שגיאה', 'שגיאה בטעינת תוכן הספר')
    } finally {
      stopLoading()
    }
  }

  const findNearestLineBreak = (content, position) => {
    // מחפש את שבירת השורה הקרובה ביותר למיקום הנוכחי
    const before = content.lastIndexOf('\n', position)
    const after = content.indexOf('\n', position)
    
    if (before === -1) return after !== -1 ? after : position
    if (after === -1) return before
    
    const distBefore = position - before
    const distAfter = after - position
    
    return distBefore < distAfter ? before : after
  }

  const findNearestParagraph = (content, position) => {
    // מחפש את הפסקה הקרובה ביותר (שורה ריקה או שתי שורות חדשות)
    const before = content.lastIndexOf('\n\n', position)
    const after = content.indexOf('\n\n', position)
    
    if (before === -1) return after !== -1 ? after : position
    if (after === -1) return before
    
    const distBefore = position - before
    const distAfter = after - position
    
    return distBefore < distAfter ? before : after
  }

  const handleSnapToLine = () => {
    if (!splittingBook?.content) return
    const newPos = findNearestLineBreak(splittingBook.content, splitPosition)
    setSplitPosition(newPos)
  }

  const handleSnapToParagraph = () => {
    if (!splittingBook?.content) return
    const newPos = findNearestParagraph(splittingBook.content, splitPosition)
    setSplitPosition(newPos)
  }

  const handleSearchAndSplit = () => {
    if (!splittingBook?.content || !searchText.trim()) return
    const index = splittingBook.content.indexOf(searchText)
    if (index !== -1) {
      setSplitPosition(index)
      setSearchText('')
    } else {
      showAlert('לא נמצא', 'הטקסט שחיפשת לא נמצא בספר')
    }
  }

  const handleClickOnLine = (lineIndex) => {
    if (!splittingBook?.content) return
    const lines = splittingBook.content.split('\n')
    let position = 0
    for (let i = 0; i < lineIndex; i++) {
      position += lines[i].length + 1 // +1 for the newline character
    }
    setSplitPosition(position)
  }

  const handleConfirmSplit = async () => {
    if (!splittingBook) return
    
    if (!firstBookTitle.trim() || !secondBookTitle.trim()) {
      showAlert('שגיאה', 'יש להזין שמות לשני הספרים')
      return
    }
    
    showConfirm(
      'אישור פיצול ספר',
      `האם אתה בטוח שברצונך לפצל את הספר "${splittingBook.title}" ל-2 ספרים נפרדים? הספר המקורי יימחק.`,
      async () => {
        try {
          setSplitting(true)
          const response = await fetch('/api/dicta/books/split', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookId: splittingBook._id,
              splitPosition,
              firstBookTitle,
              secondBookTitle
            })
          })
          
          const data = await response.json()
          
          if (response.ok) {
            setSplittingBook(null)
            loadBooks()
            showAlert('הצלחה', data.message || 'הספר פוצל בהצלחה!')
          } else {
            showAlert('שגיאה', data.error || 'שגיאה בפיצול הספר')
          }
        } catch (e) {
          console.error(e)
          showAlert('שגיאה', 'שגיאה בפיצול הספר')
        } finally {
          setSplitting(false)
        }
      }
    )
  }

  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const getSortIcon = (columnName) => {
    if (sortConfig.key !== columnName) return '↕'
    return sortConfig.direction === 'asc' ? '↑' : '↓'
  }

  // חישוב כמויות לפי סטטוס במעבר אחד על המערך
  const statusCounts = useMemo(() => {
    return books.reduce((acc, book) => {
      acc.total++
      if (book.status === 'available') acc.available++
      else if (book.status === 'in-progress') acc.inProgress++
      else if (book.status === 'completed') acc.completed++
      return acc
    }, { total: 0, available: 0, inProgress: 0, completed: 0 })
  }, [books])

  // סינון לפי סטטוס
  const filteredBooks = books.filter(book => {
    if (statusFilter === 'all') return true
    return book.status === statusFilter
  })

  const sortedBooks = [...filteredBooks].sort((a, b) => {
    if (!sortConfig.key) return 0
    
    let aValue = a[sortConfig.key] || ''
    let bValue = b[sortConfig.key] || ''
    
    // טיפול מיוחד בשדה claimedBy (שם המשתמש)
    if (sortConfig.key === 'claimedBy') {
      aValue = a.claimedBy?.name || ''
      bValue = b.claimedBy?.name || ''
    }
    
    // טיפול מיוחד בתאריך עדכון
    if (sortConfig.key === 'updatedAt') {
      aValue = new Date(a.updatedAt).getTime()
      bValue = new Date(b.updatedAt).getTime()
    }

    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1
    }
    return 0
  })

  const getStatusBadge = (status) => {
    switch(status) {
      case 'available': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">פנוי</span>
      case 'in-progress': return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">בעריכה</span>
      case 'completed': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">הושלם</span>
      default: return status
    }
  }

  // מסך טעינה מלא במידה ועדיין בודקים הרשאות או טוענים נתונים ראשוניים
  if (status === 'loading' || loading) return (
    <div className="flex justify-center items-center h-64">
      <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
    </div>
  )

  // אם המשתמש לא אדמין (למרות שה-useEffect אמור להעיף אותו, זה מונע ריצוד)
  if (session?.user?.role !== 'admin') return null;

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
                className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
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
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          הכל ({statusCounts.total})
        </button>
        <button
          onClick={() => setStatusFilter('available')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'available'
              ? 'bg-green-600 text-white shadow-sm'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          פנוי ({statusCounts.available})
        </button>
        <button
          onClick={() => setStatusFilter('in-progress')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'in-progress'
              ? 'bg-orange-600 text-white shadow-sm'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          בטיפול ({statusCounts.inProgress})
        </button>
        <button
          onClick={() => setStatusFilter('completed')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            statusFilter === 'completed'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          הושלם ({statusCounts.completed})
        </button>
      </div>

      {/* רשימת ספרים */}
      {filteredBooks.length === 0 ? (
        <div className="text-center py-12 text-on-surface/60 border-2 border-dashed border-gray-300 rounded-xl">
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
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full bg-white">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 text-sm">
                <th 
                  onClick={() => handleSort('title')}
                  className="text-right p-4 font-bold cursor-pointer hover:bg-gray-200 select-none"
                >
                  שם הספר {getSortIcon('title')}
                </th>
                <th 
                  onClick={() => handleSort('status')}
                  className="text-right p-4 font-bold cursor-pointer hover:bg-gray-200 select-none"
                >
                  סטטוס {getSortIcon('status')}
                </th>
                <th 
                  onClick={() => handleSort('claimedBy')}
                  className="text-right p-4 font-bold cursor-pointer hover:bg-gray-200 select-none"
                >
                  נערך ע"י {getSortIcon('claimedBy')}
                </th>
                <th 
                  onClick={() => handleSort('updatedAt')}
                  className="text-right p-4 font-bold cursor-pointer hover:bg-gray-200 select-none"
                >
                  עדכון אחרון {getSortIcon('updatedAt')}
                </th>
                <th className="text-center p-4 font-bold">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedBooks.map(book => (
                <tr key={book._id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900">{book.title}</td>
                  <td className="p-4">{getStatusBadge(book.status)}</td>
                  <td className="p-4 text-sm">{book.claimedBy?.name || '-'}</td>
                  <td className="p-4 text-sm text-gray-500">
                    {new Date(book.updatedAt).toLocaleDateString('he-IL', {
                        day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => router.push(`/library/dicta-books/edit/${book._id}`)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="פתח בעורך"
                      >
                        <span className="material-symbols-outlined">edit_note</span>
                      </button>
                      {book.status !== 'completed' && (
                        <button
                          onClick={() => handleSplitBook(book)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="פצל ספר ל-2"
                        >
                          <span className="material-symbols-outlined">call_split</span>
                        </button>
                      )}
                      {book.status === 'in-progress' && (
                        <button
                          onClick={() => handleReleaseBook(book._id, book.title)}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="שחרר ספר (בטל נעילה)"
                        >
                          <span className="material-symbols-outlined">lock_open</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleEditStatus(book)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="ערוך סטטוס"
                      >
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                      <button
                        onClick={() => handleDeleteBook(book._id, book.title)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="מחק ספר"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
      
    {/* חלון קופץ ליצירת ספר חדש */}
    {showCreateForm && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
        <div 
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden relative" 
          onClick={e => e.stopPropagation()}
        >
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-800">יצירת ספר חדש ידנית</h3>
            <button onClick={() => setShowCreateForm(false)} className="text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 p-1">
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
          
          <div className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-2 font-medium text-gray-700">שם הספר</label>
                <input
                  type="text"
                  value={newBookTitle}
                  onChange={(e) => setNewBookTitle(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                  placeholder="הזן שם לספר"
                />
              </div>
              <div>
                <label className="block text-sm mb-2 font-medium text-gray-700">תוכן התחלתי (אופציונלי)</label>
                <textarea
                  value={newBookContent}
                  onChange={(e) => setNewBookContent(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg h-48 focus:ring-2 focus:ring-primary outline-none"
                  placeholder="הדבק כאן טקסט התחלתי..."
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => setShowCreateForm(false)}
                className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                ביטול
              </button>
              <button 
                onClick={handleCreateBook}
                className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium shadow-sm transition-colors"
              >
                צור ספר
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {editingBook && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
        <div 
          className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden relative" 
          onClick={e => e.stopPropagation()}
        >
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-800">עריכת סטטוס ספר</h3>
            <button onClick={() => setEditingBook(null)} className="text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 p-1">
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
          
          <div className="p-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">שם הספר</label>
              <div className="w-full p-3 bg-gray-50 rounded-lg text-gray-600 border border-gray-200">
                {editingBook.title}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">סטטוס</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-primary outline-none bg-white"
              >
                <option value="available">פנוי</option>
                <option value="in-progress">בעריכה</option>
                <option value="completed">הושלם</option>
              </select>
            </div>
            
            <div className="flex justify-end gap-3 mt-8">
              <button 
                onClick={() => setEditingBook(null)}
                className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                ביטול
              </button>
              <button 
                onClick={handleSaveStatus}
                className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium shadow-sm transition-colors"
              >
                שמור שינויים
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {splittingBook && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 h-screen w-screen">
        <div 
          className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden relative max-h-[90vh] flex flex-col" 
          onClick={e => e.stopPropagation()}
        >
          <div className="p-4 border-b bg-purple-50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-600">call_split</span>
              <h3 className="font-bold text-lg text-gray-800">פיצול ספר ל-2 ספרים</h3>
            </div>
            <button onClick={() => setSplittingBook(null)} className="text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 p-1">
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto flex-1">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">ספר מקורי</label>
              <div className="w-full p-3 bg-gray-50 rounded-lg text-gray-600 border border-gray-200 font-bold">
                {splittingBook.title}
              </div>
            </div>

            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 mb-6">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-yellow-600 mt-0.5">warning</span>
                <div className="text-sm text-yellow-800">
                  <p className="font-bold mb-1">שים לב!</p>
                  <ul className="space-y-1">
                    <li>• הספר המקורי יימחק ובמקומו ייווצרו 2 ספרים חדשים</li>
                    <li>• הספר הראשון ישמור את הסטטוס והבעלות של הספר המקורי</li>
                    <li>• הספר השני יהיה פנוי לעריכה</li>
                    <li>• פעולה זו אינה הפיכה</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">שם הספר הראשון</label>
                <input
                  type="text"
                  value={firstBookTitle}
                  onChange={(e) => setFirstBookTitle(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="שם לחלק הראשון"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">שם הספר השני</label>
                <input
                  type="text"
                  value={secondBookTitle}
                  onChange={(e) => setSecondBookTitle(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                  placeholder="שם לחלק השני"
                />
              </div>
            </div>

            {/* כפתורי תצוגה */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setViewMode('preview')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                תצוגה מקדימה
              </button>
              <button
                onClick={() => setViewMode('full')}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                  viewMode === 'full'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                תצוגה מלאה (בחר שורה)
              </button>
            </div>

            {viewMode === 'preview' ? (
              <>
                {/* תצוגה מקדימה - הממשק הקיים */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      מיקום הפיצול (תו {splitPosition.toLocaleString()} מתוך {(splittingBook.content?.length || 0).toLocaleString()})
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={splittingBook.content?.length || 0}
                      value={splitPosition}
                      onChange={(e) => setSplitPosition(Math.max(0, Math.min(parseInt(e.target.value) || 0, splittingBook.content?.length || 0)))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={splittingBook.content?.length || 0}
                    value={splitPosition}
                    onChange={(e) => setSplitPosition(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>התחלה</span>
                    <span>אמצע</span>
                    <span>סוף</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleSnapToLine}
                      className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">format_align_right</span>
                      <span>התאם לשורה הקרובה</span>
                    </button>
                    <button
                      onClick={handleSnapToParagraph}
                      className="flex-1 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium flex items-center justify-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">format_paragraph</span>
                      <span>התאם לפסקה הקרובה</span>
                    </button>
                  </div>
                </div>

                {/* חיפוש טקסט */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">חפש טקסט ופצל שם</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchAndSplit()}
                      className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                      placeholder="הזן טקסט לחיפוש..."
                    />
                    <button
                      onClick={handleSearchAndSplit}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                    >
                      חפש
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-blue-600 text-sm">book</span>
                      <h4 className="font-bold text-sm text-gray-700">ספר ראשון</h4>
                      {splittingBook.status === 'in-progress' && (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">בעריכה</span>
                      )}
                      {splittingBook.status === 'available' && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">פנוי</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600 mb-2 space-y-1">
                      <div>{(splittingBook.content?.substring(0, splitPosition).trim().length || 0).toLocaleString()} תווים</div>
                      <div>{(splittingBook.content?.substring(0, splitPosition).trim().split('\n').length || 0).toLocaleString()} שורות</div>
                      <div>{(splittingBook.content?.substring(0, splitPosition).trim().split('\n\n').length || 0).toLocaleString()} פסקאות</div>
                      {splittingBook.claimedBy && (
                        <div className="text-blue-700 font-medium">נערך ע"י: {splittingBook.claimedBy.name}</div>
                      )}
                    </div>
                    <div className="bg-white rounded p-3 text-xs text-gray-700 max-h-40 overflow-y-auto font-mono leading-relaxed" dir="rtl">
                      {splittingBook.content?.substring(0, splitPosition).trim().substring(0, 500) || ''}
                      {(splittingBook.content?.substring(0, splitPosition).trim().length || 0) > 500 && '...'}
                    </div>
                  </div>
                  
                  <div className="border border-gray-200 rounded-lg p-4 bg-green-50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-green-600 text-sm">book</span>
                      <h4 className="font-bold text-sm text-gray-700">ספר שני</h4>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">פנוי</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2 space-y-1">
                      <div>{(splittingBook.content?.substring(splitPosition).trim().length || 0).toLocaleString()} תווים</div>
                      <div>{(splittingBook.content?.substring(splitPosition).trim().split('\n').length || 0).toLocaleString()} שורות</div>
                      <div>{(splittingBook.content?.substring(splitPosition).trim().split('\n\n').length || 0).toLocaleString()} פסקאות</div>
                    </div>
                    <div className="bg-white rounded p-3 text-xs text-gray-700 max-h-40 overflow-y-auto font-mono leading-relaxed" dir="rtl">
                      {splittingBook.content?.substring(splitPosition).trim().substring(0, 500) || ''}
                      {(splittingBook.content?.substring(splitPosition).trim().length || 0) > 500 && '...'}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* תצוגה מלאה - בחירת שורה */}
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <span className="material-symbols-outlined text-blue-600">info</span>
                    <p>לחץ על שורה כדי לבחור אותה כמיקום הפיצול. השורה שנבחרה תהיה השורה הראשונה של הספר השני.</p>
                  </div>
                </div>

                <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                  <div className="max-h-96 overflow-y-auto">
                    {splittingBook.content?.split('\n').map((line, index) => {
                      const lineStartPos = splittingBook.content.split('\n').slice(0, index).join('\n').length + (index > 0 ? 1 : 0)
                      const isSelected = Math.abs(lineStartPos - splitPosition) < 10
                      const isBefore = lineStartPos < splitPosition
                      
                      return (
                        <div
                          key={index}
                          onClick={() => handleClickOnLine(index)}
                          className={`px-4 py-2 cursor-pointer transition-colors border-b border-gray-100 hover:bg-purple-50 ${
                            isSelected 
                              ? 'bg-purple-200 border-l-4 border-l-purple-600 font-bold' 
                              : isBefore 
                                ? 'bg-blue-50' 
                                : 'bg-green-50'
                          }`}
                          dir="rtl"
                        >
                          <span className="text-xs text-gray-400 mr-2 select-none">{index + 1}</span>
                          <span className="text-sm font-mono">{line || '\u00A0'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="font-bold text-blue-800 mb-1 flex items-center gap-2">
                      <span>ספר ראשון</span>
                      {splittingBook.status === 'in-progress' && (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">בעריכה</span>
                      )}
                      {splittingBook.status === 'available' && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">פנוי</span>
                      )}
                    </div>
                    <div className="text-blue-700">
                      {(splittingBook.content?.substring(0, splitPosition).trim().split('\n').length || 0).toLocaleString()} שורות
                    </div>
                    {splittingBook.claimedBy && (
                      <div className="text-xs text-blue-600 mt-1">נערך ע"י: {splittingBook.claimedBy.name}</div>
                    )}
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="font-bold text-green-800 mb-1 flex items-center gap-2">
                      <span>ספר שני</span>
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">פנוי</span>
                    </div>
                    <div className="text-green-700">
                      {(splittingBook.content?.substring(splitPosition).trim().split('\n').length || 0).toLocaleString()} שורות
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="p-6 border-t bg-gray-50">
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setSplittingBook(null)}
                disabled={splitting}
                className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ביטול
              </button>
              <button 
                onClick={handleConfirmSplit}
                disabled={splitting}
                className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {splitting ? (
                  <>
                    <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    <span>מפצל...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">call_split</span>
                    <span>פצל ספר</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}