'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import { useDialog } from '@/components/providers/DialogContext'
import { LoadingProvider } from '@/components/providers/LoadingContext'
import { useLoading } from '@/components/providers/LoadingContext'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

const pageStatusConfig = {
  available: {
    label: 'זמין',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
  },
  'in-progress': {
    label: 'בטיפול',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-300',
  },
  completed: {
    label: 'הושלם',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-300',
  },
}

export default function BookPage() {
  const { startLoading, stopLoading } = useLoading()
  const { data: session } = useSession()
  const router = useRouter()
  const params = useParams()
  const { showAlert, showConfirm } = useDialog()
  
  const rawPath = Array.isArray(params.path) ? params.path.join('/') : params.path
  const bookPath = decodeURIComponent(rawPath)
  
  const [bookData, setBookData] = useState(null)
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('single') 
  const [previewImage, setPreviewImage] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [ownershipFilter, setOwnershipFilter] = useState('all')

  const loadBookData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/book/${encodeURIComponent(bookPath)}`)
      const result = await response.json()
      
      if (result.success) {
        setBookData(result.book)
        setPages(result.pages || [])
      } else {
        setError(result.error || 'שגיאה בטעינת הספר')
      }
    } catch (err) {
      console.error('Error loading book:', err)
      setError('שגיאה בטעינת הספר')
    } finally {
      setLoading(false)
    }
  }, [bookPath])

  useEffect(() => {
    loadBookData()
  }, [loadBookData])


  const handleReleasePage = async (pageNumber) => {
    if (!session) return;
    
    const pageId = pages.find(p => p.number === pageNumber)?.id;

    showConfirm(
        'שחרור עמוד',
        'האם אתה בטוח שברצונך לשחרר את העמוד? תאבד 5 נקודות.',
        async () => {
            if (!pageId) {
                showAlert('שגיאה', 'שגיאה בזיהוי העמוד');
                return;
            }

            startLoading('משחרר עמוד ומעדכן נתונים...'); 

            try {
                const response = await fetch(`/api/book/release-page`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pageId: pageId })
                })

                const result = await response.json()
                
                stopLoading(); 

                if (result.success) {
                    await loadBookData() 
                    showAlert('בוצע', 'העמוד שוחרר בהצלחה');
                } else {
                    showAlert('שגיאה', result.error);
                }
            } catch (err) {
                console.error('Error releasing page:', err)
                stopLoading(); 
                showAlert('שגיאה', 'שגיאה בשחרור העמוד');
            }
        }
    );
  }

  const handleUncompletePage = async (pageNumber) => {
    if (!session) return;

    showConfirm(
        'ביטול סיום',
        'האם אתה בטוח שברצונך לבטל את הסימון "הושלם"?\nהעמוד יחזור לסטטוס "בטיפול" והנקודות שקיבלת ירדו.',
        async () => {
            try {
                const pageId = pages.find(p => p.number === pageNumber)?.id;
                if (!pageId) {
                    showAlert('שגיאה', 'שגיאה בזיהוי העמוד');
                    return;
                }

                const response = await fetch(`/api/book/uncomplete-page`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pageId: pageId })
                });

                const result = await response.json();

                if (result.success) {
                    setPages(prevPages => 
                        prevPages.map(page => 
                            page.number === pageNumber ? result.page : page
                        )
                    );
                    showAlert('בוצע', 'העמוד הוחזר לסטטוס בטיפול');
                } else {
                    showAlert('שגיאה', result.error);
                }
            } catch (err) {
                console.error('Error uncompleting page:', err);
                showAlert('שגיאה', 'שגיאה בביטול הסימון');
            }
        }
    );
  };

  const handleClaimPage = async (pageNumber) => {
    if (!session) {
      router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
      return
    }

    showConfirm(
        `עבודה על עמוד ${pageNumber}`,
        `האם אתה מעוניין לעבוד על עמוד זה?\nהעמוד יסומן כ"בטיפול" ויוצמד אליך.`,
        async () => {
            if (!session.user || (!session.user.id && !session.user._id)) {
                showAlert('שגיאה', 'שגיאת התחברות: חסר מזהה משתמש. נסה להתחבר מחדש.');
                return;
            }
            try {
                const userId = session.user._id || session.user.id;
                
                const response = await fetch(`/api/book/claim-page`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                    bookPath: bookPath,
                    pageNumber,
                    userId: userId, 
                    userName: session.user.name
                    })
                })
                
                const result = await response.json()
                
                if (result.success) {
                    setPages(prevPages => 
                    prevPages.map(page => 
                        page.number === pageNumber ? { 
                        ...page, 
                        status: 'in-progress', 
                        claimedBy: session.user.name, 
                        claimedById: userId,
                        claimedAt: new Date().toISOString()
                        } : page
                    )
                    )
                    showAlert('בהצלחה!', 'העמוד נתפס על ידך בהצלחה. כעת תוכל לערוך אותו.');
                } else {
                    if (result.error === 'TERMS_NOT_ACCEPTED' || result.redirectUrl) {
                        router.push('/library/auth/approve-terms-on-edit');
                        return;
                    }
                    showAlert('שגיאה', result.error);
                }

            } catch (error) {
                console.error('Error claiming page:', error)
                showAlert('שגיאה', 'שגיאה בתפיסת העמוד');
            }
        }
    );
  }

  const handleMarkComplete = async (pageNumber) => {
    if (!session) return

    showConfirm(
        `סיום עבודה על עמוד ${pageNumber}`,
        'האם ברצונך להעלות את הטקסט שערכת למערכת?\nהטקסט יועלה כקובץ חדש, יישלח לאישור מנהל והעמוד יסומן כהושלם.',
        async () => {
            await uploadPageText(pageNumber)
        }
    );
  }
  
  const completePageWithoutUpload = async (pageNumber) => {
    try {
      const pageId = pages.find(p => p.number === pageNumber)?.id;
      if (!pageId || !bookData.id) {
          showAlert('שגיאה', 'שגיאה בזיהוי העמוד או הספר');
          return;
      }

      const response = await fetch(`/api/book/complete-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId: pageId,
          bookId: bookData.id
        })
      })
      
      const result = await response.json()
      
      if (result.success) {
        setPages(prevPages => 
          prevPages.map(page => 
            page.number === pageNumber ? result.page : page
          )
        )
      } else {
        showAlert('שגיאה', result.error);
      }
    } catch (error) {
      console.error('Error completing page:', error)
      showAlert('שגיאה', 'שגיאה בסימון העמוד כהושלם');
    }
  }

  const uploadPageText = async (pageNumber) => {
    const performUpload = async (confirmOverwrite = false) => {
      try {
        const bookName = bookPath.replace(/[^a-zA-Z0-9א-ת]/g, '_')
        const fileName = `${bookName}_page_${pageNumber}.txt`
        
        const contentResponse = await fetch(`/api/page-content?bookPath=${encodeURIComponent(bookPath)}&pageNumber=${pageNumber}`)
        const contentResult = await contentResponse.json()
        
        if (!contentResult.success || !contentResult.data) {
          showAlert('שגיאה', 'לא נמצא תוכן לעמוד זה');
          return
        }

        const data = contentResult.data
        let textContent = ''
        
        if (data.twoColumns) {
          const rightName = data.rightColumnName || 'חלק 1'
          const leftName = data.leftColumnName || 'חלק 2'
          textContent = `${rightName}:\n${data.rightColumn}\n\n${leftName}:\n${data.leftColumn}`
        } else {
          textContent = data.content
        }

        if (!textContent.trim()) {
          showAlert('שגיאה', 'העמוד ריק, אין מה להעלות');
          return
        }

        const blob = new Blob([textContent], { type: 'text/plain' })
        const file = new File([blob], fileName, { type: 'text/plain' })

        const formData = new FormData()
        formData.append('file', file)
        formData.append('bookName', `${bookPath} - עמוד ${pageNumber}`)
        formData.append('userId', session.user._id)
        formData.append('userName', session.user.name)
        if (confirmOverwrite) {
          formData.append('confirmOverwrite', 'true')
        }

        const uploadResponse = await fetch('/api/upload-book', {
          method: 'POST',
          body: formData
        })

        const uploadResult = await uploadResponse.json()

        // אם נדרש אישור
        if (uploadResult.requiresConfirmation) {
          const confirmed = await showConfirm(
            'קובץ קיים',
            uploadResult.message
          )
          
          if (confirmed) {
            await performUpload(true)
          }
          return
        }

        if (uploadResult.success) {
          await completePageWithoutUpload(pageNumber)
          showAlert('הצלחה', 'הטקסט הועלה בהצלחה והעמוד סומן כהושלם!');
        } else {
          showAlert('שגיאה', uploadResult.error || 'שגיאה בהעלאת הטקסט');
        }
      } catch (error) {
        console.error('Error uploading text:', error)
        showAlert('שגיאה', 'שגיאה בהעלאת הטקסט');
      }
    }

    await performUpload()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner message="טוען את הספר..." size="lg" />
      </div>
    )
  }

  if (error || !bookData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center glass-strong p-8 rounded-2xl max-w-md">
          <span className="material-symbols-outlined text-6xl text-red-500 mb-4 block">
            error
          </span>
          <h2 className="text-2xl font-bold text-on-surface mb-2">שגיאה</h2>
          <p className="text-on-surface/70 mb-4">{error}</p>
          <Link 
            href="/library/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-lg hover:bg-accent transition-colors"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
            <span>חזרה לספרייה</span>
          </Link>
        </div>
      </div>
    )
  }

  const stats = {
    total: pages.length,
    available: pages.filter(p => p.status === 'available').length,
    inProgress: pages.filter(p => p.status === 'in-progress').length,
    completed: pages.filter(p => p.status === 'completed').length,
  }

  return (
  <div className="flex min-h-screen flex-col bg-background">
    {/* Global Header Component */}
    <Header />

    {/* Sticky Page Header */}
    <header className="glass-strong border-b border-surface-variant sticky top-0 z-40">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href={bookData.isOwner ? '/library/dashboard/my-uploads' : '/library/books'} 
            className="flex items-center gap-2 text-on-surface hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">arrow_forward</span>
            <span>{bookData.isOwner ? 'חזרה לספרים שלי' : 'חזרה לרשימת הספרים'}</span>
          </Link>
          <div className="w-px h-8 bg-surface-variant"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-xl text-red-600">
                picture_as_pdf
              </span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-on-surface flex items-center gap-2">
                {bookData.name}
                {bookData.isOwner && (
                  <span className="material-symbols-outlined text-primary text-xl" title="ספר אישי">
                    lock_person
                  </span>
                )}
              </h1>
              <p className="text-sm text-on-surface/60">{stats.total} עמודים</p>
            </div>
          </div>
        </div>
      </div>
    </header>

    {/* Main Content Area */}
    <div className="container mx-auto px-4 py-8 flex-grow">
      <div className="max-w-7xl mx-auto">
        
        {/* Filters */}
        <div className={`grid gap-4 mb-8 ${bookData.isOwner ? 'grid-cols-3' : 'grid-cols-4'}`}>
          <button 
            onClick={() => setActiveFilter('all')}
            className={`glass p-4 rounded-xl text-center border transition-all ${
              activeFilter === 'all' 
              ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
              : 'border-surface-variant/30 hover:border-primary/50'
            }`}
          >
            <p className="text-3xl font-bold text-on-surface">{stats.total}</p>
            <p className="text-sm text-on-surface/70">סה&quot;כ עמודים</p>
          </button>
          
          {!bookData.isOwner && (
            <button 
                onClick={() => setActiveFilter('available')}
                className={`glass p-4 rounded-xl text-center border-2 transition-all ${
                activeFilter === 'available'
                    ? 'border-gray-500 bg-gray-50 ring-2 ring-gray-200'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
            >
                <p className="text-3xl font-bold text-gray-700">{stats.available}</p>
                <p className="text-sm text-gray-700">זמינים</p>
            </button>
          )}
          
          <button 
            onClick={() => setActiveFilter('in-progress')}
            className={`glass p-4 rounded-xl text-center border-2 transition-all ${
              activeFilter === 'in-progress'
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-blue-300 hover:border-blue-400'
            }`}
          >
            <p className="text-3xl font-bold text-blue-700">{stats.inProgress}</p>
            <p className="text-sm text-blue-700">בטיפול</p>
          </button>
          
          <button 
            onClick={() => setActiveFilter('completed')}
            className={`glass p-4 rounded-xl text-center border-2 transition-all ${
              activeFilter === 'completed'
                ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                : 'border-green-300 hover:border-green-400'
            }`}
          >
            <p className="text-3xl font-bold text-green-700">{stats.completed}</p>
            <p className="text-sm text-green-700">הושלמו</p>
          </button>
        </div>

        {/* Pages Grid Container */}
        <div className="glass-strong rounded-2xl p-6 border border-surface-variant/30">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-on-surface">עמודי הספר</h2>
                
                {/* Ownership Filter Buttons */}
                <div className="flex bg-surface-variant/30 rounded-lg p-1">
                    <button 
                        onClick={() => setOwnershipFilter('all')} 
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            ownershipFilter === 'all' 
                            ? 'bg-white shadow-sm text-primary' 
                            : 'text-on-surface/60 hover:text-on-surface hover:bg-surface-variant'
                        }`}
                    >
                        כל העמודים
                    </button>
                    <button 
                        onClick={() => setOwnershipFilter('mine')} 
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                            ownershipFilter === 'mine' 
                            ? 'bg-white shadow-sm text-primary' 
                            : 'text-on-surface/60 hover:text-on-surface hover:bg-surface-variant'
                        }`}
                    >
                        העמודים שלי
                    </button>
                </div>
            </div>
            
            <div className="flex gap-2 bg-surface rounded-lg p-1">
              <button onClick={() => setViewMode('single')} className={`p-2 rounded transition-colors ${viewMode === 'single' ? 'bg-primary text-on-primary' : 'text-on-surface/60 hover:text-on-surface hover:bg-surface-variant'}`} title="עמוד אחד">
                <span className="material-symbols-outlined">crop_portrait</span>
              </button>
              <button onClick={() => setViewMode('double')} className={`p-2 rounded transition-colors ${viewMode === 'double' ? 'bg-primary text-on-primary' : 'text-on-surface/60 hover:text-on-surface hover:bg-surface-variant'}`} title="שני עמודים">
                <span className="material-symbols-outlined">auto_stories</span>
              </button>
            </div>
          </div>
          
          <div className={
            viewMode === 'single'
              ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
              : 'grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4'
          }>
            {pages
              .filter(page => {
                  const matchesStatus = activeFilter === 'all' || page.status === activeFilter;
                  
                  let matchesOwnership = true;
                  if (ownershipFilter === 'mine') {
                      if (!session?.user) return false;
                      const userId = session.user._id || session.user.id;
                      matchesOwnership = (
                          page.claimedBy === session.user.name ||
                          page.claimedById === userId
                      );
                  }

                  return matchesStatus && matchesOwnership;
              })
              .map((page) => (
              <div
                key={page.id || page.number}
                className="relative"
                style={{ contentVisibility: 'auto', containIntrinsicSize: '300px 400px' }}
              >
                  <PageCard
                    page={page}
                    onClaim={handleClaimPage}
                    onComplete={handleMarkComplete}
                    onRelease={handleReleasePage}
                    onUncomplete={handleUncompletePage}
                    onPreview={() => setPreviewImage(page.thumbnail)}
                    currentUser={session?.user}
                    isBookOwner={bookData.isOwner}
                    bookPath={bookPath}
                    isAdmin={session?.user?.role === 'admin'}
                  />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    <ImagePreviewModal isOpen={!!previewImage} onClose={() => setPreviewImage(null)} imageSrc={previewImage} altText="תצוגת עמוד" />
  </div>
  )
}

function toGematria(num) {
  if (num === 15) return 'ט"ו';
  if (num === 16) return 'ט"ז';
  
  const letters = [
      { val: 400, char: 'ת' },
      { val: 300, char: 'ש' },
      { val: 200, char: 'ר' },
      { val: 100, char: 'ק' },
      { val: 90, char: 'צ' },
      { val: 80, char: 'פ' },
      { val: 70, char: 'ע' },
      { val: 60, char: 'ס' },
      { val: 50, char: 'נ' },
      { val: 40, char: 'מ' },
      { val: 30, char: 'ל' },
      { val: 20, char: 'כ' },
      { val: 10, char: 'י' },
      { val: 9, char: 'ט' },
      { val: 8, char: 'ח' },
      { val: 7, char: 'ז' },
      { val: 6, char: 'ו' },
      { val: 5, char: 'ה' },
      { val: 4, char: 'ד' },
      { val: 3, char: 'ג' },
      { val: 2, char: 'ב' },
      { val: 1, char: 'א' }
  ];

  let result = '';
  let n = num;
  
  for (const { val, char } of letters) {
      while (n >= val) {
          result += char;
          n -= val;
      }
  }
  
  if (result.length > 1) {
      return result.slice(0, -1) + '"' + result.slice(-1);
  } 
  return result + "'";
}

function formatHebrewDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).formatToParts(date);
    
    const dayPart = parts.find(p => p.type === 'day');
    const monthPart = parts.find(p => p.type === 'month');
    const yearPart = parts.find(p => p.type === 'year');
    
    if (!dayPart || !monthPart || !yearPart) return '';
    
    const day = parseInt(dayPart.value, 10);
    const year = parseInt(yearPart.value, 10);
    
    return `${toGematria(day)} ב${monthPart.value} ${toGematria(year % 1000)}`;
  } catch (e) {
    return '';
  }
}

function formatTimeAgo(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'היום';
    if (diffDays === 1) return 'אתמול';
    return `לפני ${diffDays} ימים`;
  } catch (e) {
    return '';
  }
}

function PageCard({ page, onClaim, onComplete, onRelease, onUncomplete, onPreview, currentUser, bookPath, isAdmin, isBookOwner }) {
  const status = pageStatusConfig[page.status]

  const editUrl = `/library/books/${encodeURIComponent(bookPath)}/${page.number}`;
  
  const isClaimedByMe = currentUser && (
    page.claimedBy === currentUser.name || 
    page.claimedById === (currentUser.id || currentUser._id)
  );

  const canEnterEditor = page.status === 'available' || isClaimedByMe || isAdmin;

  const showReleaseButton = page.status === 'in-progress' && isClaimedByMe && !isBookOwner;

  return (
    <div 
      className="group relative glass rounded-xl overflow-hidden border-2 border-surface-variant hover:border-primary/50 transition-all flex flex-col h-full"
    >
      <div 
        className="aspect-[3/4] bg-surface flex items-center justify-center relative overflow-hidden cursor-zoom-in"
        onClick={onPreview}
        title="לחץ להגדלה"
      >
        {page.thumbnail ? (
          <>
            <img src={page.thumbnail} alt={`עמוד ${page.number}`} loading="lazy" decoding="async" fetchPriority="low" className="w-full h-full object-cover" />
            <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-bold z-10 pointer-events-none">{page.number}</div>
          </>
        ) : (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-6xl text-on-surface/20">description</span>
            </div>
            <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-bold z-10 pointer-events-none">{page.number}</div>
          </>
        )}
        
        {showReleaseButton && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onRelease(page.number)
            }}
            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white p-2 rounded-lg transition-all shadow-lg z-20 cursor-pointer hover:scale-110"
            title="שחרר עמוד"
            type="button"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
      </div>

      <div className="p-3 flex flex-col flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold text-on-surface">עמוד {page.number}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${status.bgColor} ${status.color} ${status.borderColor}`}>
            {status.label}
          </span>
        </div>

        {page.claimedBy && (
          <div className="mb-2">
            <p className="text-xs text-on-surface/60 truncate font-medium" title={isClaimedByMe ? 'משויך אליך' : `ע"י ${page.claimedBy}`}>
              {isClaimedByMe ? 'משויך אליך' : `ע"י ${page.claimedBy}`}
            </p>
            {page.claimedAt && (
              <p className="text-[10px] text-on-surface/50 leading-tight">
                {formatHebrewDate(page.claimedAt)}, {formatTimeAgo(page.claimedAt)}
              </p>
            )}
          </div>
        )}

        <div className="mt-auto grid gap-2">
          {canEnterEditor && (
            <Link
              href={editUrl}
              className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-bold transition-colors ${
                page.status === 'available' 
                  ? 'bg-white border-2 border-primary text-primary hover:bg-primary/5' 
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
              }`}
              title={page.status === 'available' ? 'היכנס לצפייה או עריכה (הדף ייתפס רק בשמירה)' : 'היכנס לדף'}
            >
              <span className="material-symbols-outlined text-lg">visibility</span>
              <span>{page.status === 'available' ? 'היכנס לדף' : 'צפייה / עריכה'}</span>
            </Link>
          )}

          {page.status === 'available' && (
            <button
              onClick={() => onClaim(page.number)}
              className="w-full py-2 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-accent transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">lock</span>
              <span>תפוס לעריכה</span>
            </button>
          )}

          {page.status === 'in-progress' && isClaimedByMe && (
            <button onClick={() => onComplete(page.number)} className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-lg">check</span>
              <span>סיים עריכה</span>
            </button>
          )}

          {page.status === 'completed' && (isClaimedByMe || isAdmin) && (
            <button 
              onClick={() => onUncomplete(page.number)}
              className="w-full py-2 bg-gray-600 text-white rounded-lg text-sm font-bold hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
              title="החזר לסטטוס בטיפול"
            >
              <span className="material-symbols-outlined text-lg">undo</span>
              <span>בטל סיום</span>
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
