'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import Link from 'next/link'
import { useDialog } from '@/components/providers/DialogContext'
import DictaUploadDialog from '@/components/dicta-tools/DictaUploadDialog'
import { hasBooksAccess } from '@/lib/roles'

// קומפוננטת התוכן שמכילה את כל הלוגיקה והממשק
function DictaBooksContent() {
  const { data: session } = useSession()
  const { showAlert, showConfirm } = useDialog()
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('available')
  const [filterCategory, setFilterCategory] = useState('all')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [selectedBookForCompletion, setSelectedBookForCompletion] = useState(null)
  const [completing, setCompleting] = useState(false)
  
  const isAdmin = hasBooksAccess(session?.user?.role)
  const currentUserId = session?.user?.id

  const filters = [
    { id: 'available', label: 'זמין' },
    { id: 'in-progress', label: 'בטיפול' },
    { id: 'completed', label: 'הושלם' },
    { id: 'my-books', label: 'הספרים שלי' },
    { id: 'all', label: 'כל הספרים' }
  ]

  useEffect(() => {
    fetchBooks()
    
    // קריאת פרמטרים מה-URL
    const urlSearch = searchParams.get('search')
    const urlStatus = searchParams.get('status')
    const urlCategory = searchParams.get('category')
    
    // אם יש פרמטרים ב-URL, השתמש בהם
    if (urlSearch || urlStatus || urlCategory) {
      if (urlSearch) setSearchTerm(urlSearch)
      if (urlStatus) setFilterStatus(urlStatus)
      if (urlCategory) setFilterCategory(urlCategory)
    } else {
      // אחרת, נסה לטעון מ-sessionStorage (לתמיכה לאחור)
      const savedFilters = sessionStorage.getItem('dictaBooksFilters')
      const savedTimestamp = sessionStorage.getItem('dictaBooksTimestamp')
      
      if (savedFilters && savedTimestamp) {
        const now = Date.now()
        const timestamp = parseInt(savedTimestamp, 10)
        
        if (!isNaN(timestamp) && now - timestamp < 5000) {
          try {
            const { search, status, category } = JSON.parse(savedFilters)
            if (search) setSearchTerm(search)
            if (status) setFilterStatus(status)
            if (category) setFilterCategory(category)
          } catch (e) {
            console.error('Error loading filters:', e)
          }
        }
      }
    }
    
    sessionStorage.removeItem('dictaBooksFilters')
    sessionStorage.removeItem('dictaBooksTimestamp')
  }, [searchParams])

  // עדכון ה-URL כאשר הסינונים משתנים
  useEffect(() => {
    const params = new URLSearchParams()
    
    if (searchTerm) params.set('search', searchTerm)
    if (filterStatus && filterStatus !== 'available') params.set('status', filterStatus)
    if (filterCategory && filterCategory !== 'all') params.set('category', filterCategory)
    
    const queryString = params.toString()
    const newUrl = queryString ? `/library/dicta-books?${queryString}` : '/library/dicta-books'
    
    window.history.replaceState({}, '', newUrl)
  }, [searchTerm, filterStatus, filterCategory])

  const saveFiltersBeforeNavigation = () => {
    const filters = {
      search: searchTerm,
      status: filterStatus,
      category: filterCategory
    }
    sessionStorage.setItem('dictaBooksFilters', JSON.stringify(filters))
    sessionStorage.setItem('dictaBooksTimestamp', Date.now().toString())
  }

  const fetchBooks = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/dicta/books')
      if (res.ok) {
        const data = await res.json()
        setBooks(data)
      }
    } catch (error) {
      console.error('Error fetching books:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = (bookId) => {
    showConfirm(
      'תפיסת ספר',
      'האם אתה בטוח שברצונך לתפוס את הספר לעריכה?',
      async () => {
        try {
          const res = await fetch(`/api/dicta/books/${bookId}/claim`, {
            method: 'POST',
          })
          
          if (res.ok) {
            fetchBooks()
            showAlert('הצלחה', 'הספר נתפס בהצלחה וכעת תוכל להתחיל לערוך אותו!')
          } else {
            const data = await res.json()
            if (data.error === 'TERMS_REQUIRED' && data.redirectUrl) {
              showConfirm(
                'נדרש אישור תזכורות',
                'כדי לתפוס ספר לעריכה, עליך לאשר קבלת תזכורות במייל. האם ברצונך לעבור לדף האישור?',
                () => {
                  router.push(data.redirectUrl)
                }
              )
            } else {
              showAlert('שגיאה', data.error || 'אירעה בעיה בתפיסת הספר.')
            }
          }
        } catch (error) {
          console.error('Error claiming book:', error)
          showAlert('שגיאה', 'אירעה שגיאה בתקשורת מול השרת.')
        }
      }
    )
  }

  const handleRelease = (bookId) => {
    showConfirm(
      'שחרור ספר',
      'האם אתה בטוח שברצונך לשחרר את הספר? תאבד את הנקודות שנוספו לך ומשתמשים אחרים יוכלו לתפוס אותו לעריכה במקומך.',
      async () => {
        try {
          const res = await fetch(`/api/dicta/books/${bookId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'release' })
          })
          if (res.ok) {
            fetchBooks()
            showAlert('בוצע', 'הספר שוחרר בהצלחה והוחזר למאגר הפנויים.')
          } else {
            showAlert('שגיאה', 'אירעה בעיה בשחרור הספר.')
          }
        } catch (error) {
          console.error('Error releasing book:', error)
          showAlert('שגיאה', 'אירעה שגיאה בתקשורת מול השרת.')
        }
      }
    )
  }

  const handleComplete = async (bookId) => {
    try {
      // שלב 1: שליפת תוכן הספר מהשרת
      const bookRes = await fetch(`/api/dicta/books/${bookId}`)
      if (!bookRes.ok) throw new Error('שגיאה בטעינת הספר')
      
      const book = await bookRes.json()
      
      if (!book?.content?.trim()) {
        showAlert('שגיאה', 'הספר ריק מתוכן')
        return
      }

      // פתח את החלונית עם פרטי הספר
      setSelectedBookForCompletion(book)
      setShowUploadDialog(true)
    } catch (error) {
      console.error('Error completing book:', error)
      showAlert('שגיאה', error.message || 'אירעה שגיאה בטעינת הספר')
    }
  }

  const handleCancelCompletion = (bookId) => {
    showConfirm(
      'ביטול סיום',
      'האם אתה בטוח שברצונך לבטל את הסימון "הושלם"?\nהספר יחזור לסטטוס "בטיפול" והנקודות שקיבלת ירדו.',
      async () => {
        try {
          const res = await fetch(`/api/dicta/books/${bookId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'uncomplete' })
          })
          if (res.ok) {
            fetchBooks()
            showAlert('הצלחה', 'סיום העריכה בוטל. הספר חזר להיות בטיפולך.')
          } else {
            showAlert('שגיאה', 'אירעה בעיה בביטול סיום העריכה.')
          }
        } catch (error) {
          console.error('Error canceling completion:', error)
          showAlert('שגיאה', 'אירעה שגיאה בתקשורת מול השרת.')
        }
      }
    )
  }

  const handleUploadConfirm = async () => {
    if (!selectedBookForCompletion?.content?.trim()) return showAlert('שגיאה', 'הספר ריק מתוכן')

    const uploadBook = async (confirmOverwrite = false) => {
      try {
        setCompleting(true)
        
        const cleanBookName = selectedBookForCompletion.title.replace(/[^a-zA-Z0-9א-ת]/g, '_')
        const fileName = `${cleanBookName}_dicta.txt`
        const blob = new Blob([selectedBookForCompletion.content], { type: 'text/plain' })
        const file = new File([blob], fileName, { type: 'text/plain' })

        const formData = new FormData()
        formData.append('file', file)
        formData.append('bookName', selectedBookForCompletion.title)
        formData.append('uploadType', 'dicta')
        if (confirmOverwrite) {
          formData.append('confirmOverwrite', 'true')
        }

        const uploadResponse = await fetch('/api/upload-book', { method: 'POST', body: formData })
        const uploadResult = await uploadResponse.json()

        // אם נדרש אישור
        if (uploadResult.requiresConfirmation) {
          setCompleting(false)
          const confirmed = await showConfirm(
            'קובץ קיים',
            uploadResult.message
          )
          
          if (confirmed) {
            await uploadBook(true)
          }
          return
        }

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || 'שגיאה בהעלאה')
        }

        const completeResponse = await fetch(`/api/dicta/books/${selectedBookForCompletion._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete' })
        })

        if (completeResponse.ok) {
          setShowUploadDialog(false)
          setSelectedBookForCompletion(null)
          fetchBooks()
          showAlert('הצלחה', 'הטקסט הועלה בהצלחה והספר סומן כהושלם!')
        } else {
          showAlert('שגיאה', 'הטקסט הועלה אך אירעה בעיה בסימון הספר כהושלם.')
        }
      } catch (error) {
        console.error('Error completing book:', error)
        showAlert('שגיאה', error.message || 'אירעה שגיאה בתהליך ההעלאה')
      } finally {
        setCompleting(false)
      }
    }

    await uploadBook()
  }

  const processedBooks = useMemo(() => {
    return books.map(book => {
      const bookCategory = book.title?.split('/')[0]?.trim()
      const bookName = book.title?.split('/').slice(1).join('/').trim() || book.title
      return {
        ...book,
        bookCategory,
        bookName
      }
    })
  }, [books])

  const categories = useMemo(() => {
    return [...new Set(
      processedBooks
        .map(book => book.bookCategory)
        .filter(Boolean)
    )].sort()
  }, [processedBooks])

  const filteredBooks = useMemo(() => {
    return processedBooks.filter(book => {
      const matchesSearch = book.title?.toLowerCase().includes(searchTerm.toLowerCase())
      
      let matchesStatus = true
      if (filterStatus === 'available') {
        matchesStatus = book.status === 'available'
      } else if (filterStatus === 'in-progress') {
        matchesStatus = book.status === 'in-progress'
      } else if (filterStatus === 'completed') {
        matchesStatus = book.status === 'completed'
      } else if (filterStatus === 'my-books') {
        matchesStatus = currentUserId && book.claimedBy?._id === currentUserId
      }

      let matchesCategory = true
      if (filterCategory !== 'all') {
        matchesCategory = book.bookCategory === filterCategory
      }

      return matchesSearch && matchesStatus && matchesCategory
    })
  }, [processedBooks, searchTerm, filterStatus, filterCategory, currentUserId])

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <Header />
      
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
            <div>
              <h1 className="text-4xl font-bold font-frank text-neutral-cool-900 mb-2">עריכת ספרי דיקטה</h1>
              <p className="text-neutral-cool-600 text-lg">
                {loading ? 'טוען...' : `${filteredBooks.length} ספרים מוצגים`}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              <Link 
                href="/docs/dicta" 
                className="inline-flex items-center gap-2 bg-white border border-neutral-cool-200 text-neutral-cool-700 px-5 py-2.5 rounded-xl hover:bg-neutral-cool-50 transition-all font-semibold shadow-sm"
              >
                <span className="material-symbols-outlined text-primary">help_outline</span>
                מדריך לטיפול בספרי דיקטה
              </Link>

              <Link 
                href="/library/editingtools" 
                className="inline-flex items-center gap-2 bg-white border border-neutral-cool-200 text-neutral-cool-700 px-5 py-2.5 rounded-xl hover:bg-neutral-cool-50 transition-all font-semibold shadow-sm"
              >
                <span className="material-symbols-outlined text-primary">construction</span>
                כלי עריכה אופליין
              </Link>

              {isAdmin && (
                <Link 
                  href="/library/admin/dicta-books" 
                  className="inline-flex items-center gap-2 bg-white border border-neutral-cool-200 text-neutral-cool-700 px-5 py-2.5 rounded-xl hover:bg-neutral-cool-50 transition-all font-semibold shadow-sm"
                >
                  <span className="material-symbols-outlined text-primary">security</span>
                  ממשק ניהול וסנכרון
                </Link>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-neutral-cool-400 w-5 h-5">
                search
              </span>
              <input 
                type="text"
                placeholder="חיפוש ספר לפי שם..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-neutral-cool-200 rounded-2xl py-3 pr-12 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm text-lg"
              />
            </div>

            <div className="min-w-[200px]">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full h-full px-4 py-3 rounded-2xl border border-neutral-cool-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm text-lg cursor-pointer"
              >
                <option value="all">כל הקטגוריות</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex bg-neutral-cool-100 p-1.5 rounded-2xl border border-neutral-cool-200 self-start md:self-stretch items-center shadow-inner overflow-x-auto">
              {filters.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterStatus(f.id)}
                  className={`px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                    filterStatus === f.id 
                      ? 'bg-white text-neutral-cool-800 shadow-sm' 
                      : 'text-neutral-cool-500 hover:text-neutral-cool-700 hover:bg-neutral-cool-200/50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-48 bg-white animate-pulse rounded-2xl border border-neutral-cool-100"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBooks.length > 0 ? (
                filteredBooks.map((book) => {
                  const isOwner = currentUserId && book.claimedBy?._id === currentUserId
                  const canEdit = isOwner || isAdmin
                  const isCompleted = book.status === 'completed'

                  return (
                    <div key={book._id} className={`group bg-white rounded-2xl border border-neutral-cool-200 p-6 transition-all flex flex-col h-full ${isCompleted ? 'opacity-80' : 'hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                          book.status === 'completed' ? 'bg-info-50 text-info-600 border border-info-100' :
                          book.status === 'available' 
                            ? 'bg-success-alt-50 text-success-alt-600 border border-success-alt-100' 
                            : 'bg-warning-50 text-warning-600 border border-warning-100'
                        }`}>
                          {book.status === 'completed' ? 'הושלם' : book.status === 'available' ? 'זמין לעריכה' : 'בטיפול'}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {isOwner && !isCompleted && (
                            <button
                              onClick={(e) => { e.preventDefault(); handleRelease(book._id); }}
                              className="text-danger-400 hover:text-danger-600 hover:bg-danger-50 p-1 rounded-md transition-colors flex items-center justify-center cursor-pointer"
                              title="שחרר ספר"
                            >
                              <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                          )}
                          <span className={`material-symbols-outlined transition-colors ${isCompleted ? 'text-info-300' : 'text-neutral-cool-300 group-hover:text-primary'}`}>
                            {isCompleted ? 'task_alt' : 'menu_book'}
                          </span>
                        </div>
                      </div>

                      {book.bookCategory && (
                        <div className="mb-2">
                          <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg bg-neutral-cool-100 text-neutral-cool-600 border border-neutral-cool-200">
                            {book.bookCategory}
                          </span>
                        </div>
                      )}

                      <h3 className="text-xl font-bold text-neutral-cool-800 mb-2 font-frank leading-tight line-clamp-2" title={book.title}>
                        {book.bookName}
                      </h3>

                      <div className="mt-auto pt-6">
                        <div className="flex flex-col gap-2 mb-6">
                          {book.status === 'completed' ? (
                            <div className="flex items-center gap-2 text-sm text-info-600 font-medium">
                              <span className="material-symbols-outlined text-base">verified</span>
                              <span>הושלם על ידי {book.claimedBy?.name || 'לא ידוע'}</span>
                            </div>
                          ) : book.status === 'in-progress' ? (
                            <div className="flex items-center gap-2 text-sm text-neutral-cool-500">
                              <span className="material-symbols-outlined text-base">person</span>
                              <span>נערך על ידי {book.claimedBy?.name || 'לא ידוע'}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm text-success-alt-600 font-medium">
                              <span className="material-symbols-outlined text-base">check_circle</span>
                              <span>פנוי לתפיסה</span>
                            </div>
                          )}
                        </div>

                        {isCompleted ? (
                          <div className="flex gap-3">
                            <Link 
                              href={`/library/dicta-books/edit/${book._id}`}
                              onClick={saveFiltersBeforeNavigation}
                              className="flex-[2] text-center bg-info-50 text-info-700 border border-info-200 py-3 rounded-xl font-bold hover:bg-info-100 transition-all shadow-sm"
                            >
                              צפה בספר
                            </Link>
                            {canEdit && (
                              <button 
                                onClick={() => handleCancelCompletion(book._id)}
                                className="flex-1 text-center bg-white border border-neutral-cool-200 text-neutral-cool-700 py-3 rounded-xl font-bold hover:bg-neutral-cool-50 transition-all shadow-sm"
                              >
                                בטל סיום
                              </button>
                            )}
                          </div>
                        ) : book.status === 'available' ? (
                          <div className="flex gap-3">
                            <Link 
                              href={`/library/dicta-books/edit/${book._id}`}
                              onClick={saveFiltersBeforeNavigation}
                              className="flex-1 text-center bg-white border border-neutral-cool-200 text-neutral-cool-700 py-3 rounded-xl font-bold hover:bg-neutral-cool-50 transition-all shadow-sm"
                            >
                              הצצה
                            </Link>
                            <button 
                              onClick={() => handleClaim(book._id)}
                              className="flex-[2] text-center bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-md"
                            >
                              תפוס לעריכה
                            </button>
                          </div>
                        ) : canEdit ? (
                          <div className="flex gap-3">
                            <Link 
                              href={`/library/dicta-books/edit/${book._id}`}
                              onClick={saveFiltersBeforeNavigation}
                              className="flex-[2] text-center bg-neutral-cool-900 text-white py-3 rounded-xl font-bold hover:bg-neutral-cool-800 transition-all shadow-md"
                            >
                              פתח עורך
                            </Link>
                            <button 
                              onClick={() => handleComplete(book._id)}
                              className="flex-1 text-center bg-success-alt-50 text-success-alt-700 border border-success-alt-200 py-3 rounded-xl font-bold hover:bg-success-alt-100 transition-all shadow-sm"
                            >
                              סיום
                            </button>
                          </div>
                        ) : (
                          <button 
                            disabled
                            className="block w-full text-center bg-neutral-cool-100 text-neutral-cool-400 py-3 rounded-xl font-bold cursor-not-allowed border border-neutral-cool-200"
                          >
                            נעול לעריכה
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="col-span-full text-center py-20 bg-white rounded-3xl border border-dashed border-neutral-cool-300">
                  <p className="text-neutral-cool-400 text-lg">לא נמצאו ספרים התואמים לסינון הנוכחי.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {showUploadDialog && selectedBookForCompletion && (
        <DictaUploadDialog
          bookTitle={selectedBookForCompletion?.title}
          onConfirm={handleUploadConfirm}
          onCancel={() => {
            setShowUploadDialog(false)
            setSelectedBookForCompletion(null)
          }}
          loading={completing}
        />
      )}
    </div>
  )
}

// הייצוא הראשי שעוטף ב-Suspense כדי לפתור את שגיאת ה-Build
export default function DictaBooksPublicPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <DictaBooksContent />
    </Suspense>
  )
}
