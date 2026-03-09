'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Button from '@/components/Button'
import { useDialog } from '@/components/DialogContext'
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'
import DictaEditorCore from '@/components/editor/DictaEditorCore'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function DictaEditorPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, status } = useSession()
  const { showAlert, showConfirm } = useDialog()
  const bookId = params?.bookId
  
  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [isEditCopy, setIsEditCopy] = useState(false) // האם זה עותק עריכה מהעלאה
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const currentUserId = session?.user?.id
  const isAdmin = session?.user?.role === 'admin'

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    const handleClick = (e) => {
      const target = e.target.closest('a')
      if (target && target.href && hasUnsavedChanges) {
        const currentUrl = new URL(window.location.href)
        const targetUrl = new URL(target.href, window.location.origin)
        
        if (currentUrl.origin === targetUrl.origin && currentUrl.pathname !== targetUrl.pathname) {
          const confirmLeave = window.confirm('ישנם שינויים לא שמורים. האם אתה בטוח שברצונך לעזוב את הדף?')
          if (!confirmLeave) {
            e.preventDefault()
            e.stopPropagation()
          }
        }
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [hasUnsavedChanges])

  const loadBook = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/dicta/books/${bookId}`)
      if (!res.ok) throw new Error('שגיאה בטעינת הספר')
      const data = await res.json()
      setBook(data)
      setIsEditCopy(data.isEditCopy || false) // שמירת מידע אם זה עותק עריכה
    } catch (error) {
      console.error('Error loading book:', error)
      showAlert('שגיאה', 'שגיאה בטעינת הספר')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
      return
    }
    
    if (bookId) loadBook()
  }, [bookId, status, router, showAlert])

  const handleSaveToServer = async (currentContent, silent = false) => {
    try {
      setSaving(true)
      const res = await fetch(`/api/dicta/books/${bookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentContent })
      })
      
      if (!res.ok) throw new Error('שגיאה בשמירה')
      
      setBook(prev => ({ ...prev, content: currentContent }))
      setHasUnsavedChanges(false)
      
      if (!silent) {
        showAlert('הצלחה', 'העריכה נשמרה בהצלחה!')
      }
    } catch (error) {
      console.error('Error saving book:', error)
      showAlert('שגיאה', 'שגיאה בשמירת הספר')
    } finally {
      setSaving(false)
    }
  }

  const handleClaim = () => {
    showConfirm(
      'תפיסת ספר',
      'האם אתה בטוח שברצונך לתפוס את הספר לעריכה?',
      async () => {
        try {
          setClaiming(true)
          const res = await fetch(`/api/dicta/books/${bookId}/claim`, {
            method: 'POST',
          })
          
          if (res.ok) {
            await loadBook()
            showAlert('הצלחה', 'הספר נתפס בהצלחה וכעת תוכל להתחיל לערוך אותו!')
          } else {
            const data = await res.json()
            if (data.error === 'TERMS_REQUIRED' && data.redirectUrl) {
              showConfirm(
                'נדרש אישור תזכורות',
                'כדי לתפוס ספר לעריכה, עליך לאשר קבלת תזכורות במייל. האם ברצונך לעבור לדף האישור?',
                () => router.push(data.redirectUrl)
              )
            } else {
              showAlert('שגיאה', data.error || 'אירעה בעיה בתפיסת הספר. ייתכן שהוא נתפס על ידי משתמש אחר.')
            }
          }
        } catch (error) {
          console.error('Error claiming book:', error)
          showAlert('שגיאה', 'אירעה שגיאה בתקשורת מול השרת.')
        } finally {
          setClaiming(false)
        }
      }
    )
  }

  const handleComplete = () => {
    if (!session) return showAlert('שגיאה', 'אינך מחובר למערכת')
    
    if (hasUnsavedChanges) {
      showAlert('שים לב', 'ישנם שינויים לא שמורים. אנא לחץ על כפתור השמירה לפני סיום העבודה והעלאת הקובץ.')
      return
    }
    
    setShowUploadDialog(true)
  }

  const handleUploadConfirm = async () => {
    if (!book?.content?.trim()) return showAlert('שגיאה', 'הספר ריק מתוכן')

    const uploadBook = async (confirmOverwrite = false) => {
      try {
        setCompleting(true)
        
        const cleanBookName = book.title.replace(/[^a-zA-Z0-9א-ת]/g, '_')
        const fileName = `${cleanBookName}_dicta.txt`
        const blob = new Blob([book.content], { type: 'text/plain' })
        const file = new File([blob], fileName, { type: 'text/plain' })

        const formData = new FormData()
        formData.append('file', file)
        formData.append('bookName', book.title)
        formData.append('userId', session.user._id || session.user.id)
        formData.append('userName', session.user.name)
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

        const completeResponse = await fetch(`/api/dicta/books/${bookId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete' })
        })

        if (completeResponse.ok) {
          setShowUploadDialog(false)
          showAlert('הצלחה', 'הטקסט הועלה בהצלחה והספר סומן כהושלם!')
          setTimeout(() => {
            router.push('/library/dicta-books')
          }, 1500)
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

  const handleReset = () => {
    setShowResetDialog(true)
  }

  const handleDelete = () => {
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true)
      const res = await fetch(`/api/dicta/books/${bookId}`, {
        method: 'DELETE',
      })
      
      if (res.ok) {
        showAlert('הצלחה', 'עותק העריכה נמחק בהצלחה')
        router.push('/library/admin/uploads')
      } else {
        const data = await res.json()
        showAlert('שגיאה', data.error || 'שגיאה במחיקת עותק העריכה')
      }
    } catch (error) {
      console.error('Error deleting edit copy:', error)
      showAlert('שגיאה', 'שגיאה במחיקת עותק העריכה')
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const getDownloadBaseName = (title = 'dicta-book') => {
    const normalizedTitle = typeof title === 'string' ? title : 'dicta-book'
    const lastSegment = normalizedTitle.split('/').filter(Boolean).pop() || normalizedTitle
    return lastSegment.trim() || 'dicta-book'
  }

  const handleDownloadSavedBook = async () => {
    try {
      setDownloading(true)
      const response = await fetch(`/api/dicta/books/${bookId}/download`)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'שגיאה בהורדת הספר')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const contentDisposition = response.headers.get('content-disposition') || ''
      const filenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
      const fallbackFilename = `${getDownloadBaseName(book?.title)}_dicta.txt`
      const filename = decodeURIComponent(filenameMatch?.[1] || filenameMatch?.[2] || fallbackFilename)

      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading saved book:', error)
      showAlert('שגיאה', error.message || 'שגיאה בהורדת הספר')
    } finally {
      setDownloading(false)
    }
  }

  const handleResetConfirm = async () => {
    try {
      setResetting(true)
      const res = await fetch(`/api/dicta/books/${bookId}/reset`, {
        method: 'POST',
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'שגיאה באיפוס הספר')
      }
      
      setBook(prev => ({ ...prev, content: data.book.content }))
      setHasUnsavedChanges(false)
      setShowResetDialog(false)
      showAlert('הצלחה', 'הספר אופס בהצלחה! נתוני הספר נמשכו מחדש מגיטהאב.')
    } catch (error) {
      console.error('Error resetting book:', error)
      showAlert('שגיאה', error.message || 'אירעה שגיאה באיפוס הספר')
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner message="טוען נתונים..." />
      </div>
    )
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">הספר לא נמצא</div>
      </div>
    )
  }

  const claimedById = book?.claimedBy?._id || book?.claimedBy
  const isOwner = currentUserId && claimedById === currentUserId
  const isCompleted = book?.status === 'completed'
  const canEdit = isEditCopy ? isAdmin : ((!isCompleted && isOwner) || isAdmin) // עותקי עריכה - רק אדמין
  const isAvailable = !isEditCopy && !claimedById && !isCompleted // עותקי עריכה לא ניתנים לתפיסה

  const headerStart = (
    <>
      <Link href="/library" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <img src="/logo.png" alt="לוגו אוצריא" className="w-10 h-10" />
        <span className="text-lg font-bold text-black" style={{ fontFamily: 'FrankRuehl, serif' }}>ספריית אוצריא</span>
      </Link>
      <div className="w-px h-8 bg-surface-variant"></div>
      <Button
        icon="arrow_forward"
        variant="ghost"
        onClick={() => router.push(isEditCopy ? '/library/admin/uploads' : '/library/dicta-books')}
        label={isEditCopy ? 'חזרה להעלאות' : 'חזרה לדיקטה'}
      />
      <div className="w-px h-8 bg-surface-variant"></div>
      {isEditCopy && (
        <>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm">
            <span className="material-symbols-outlined text-sm">content_copy</span>
            <span>עותק עריכה</span>
          </div>
          <div className="w-px h-8 bg-surface-variant"></div>
        </>
      )}
    </>
  )

  const headerEnd = (
    <div className="flex items-center gap-4">
      <Button
        icon="download"
        variant="ghost"
        size="sm"
        onClick={handleDownloadSavedBook}
        loading={downloading}
        label="הורד ספר"
        title="מוריד את הגרסה השמורה בלבד, ללא שינויים לא שמורים"
      />

      {canEdit && (
        <Button
          icon="restart_alt"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          loading={resetting}
          label="אפס ספר"
        />
      )}
      
      {isEditCopy && isAdmin && (
        <Button
          icon="delete"
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          loading={deleting}
          label="מחק עותק"
        />
      )}
      
      {isAvailable ? (
        <Button
          icon="back_hand"
          variant="primary"
          onClick={handleClaim}
          loading={claiming}
          label="תפוס לעריכה"
        />
      ) : canEdit && !isCompleted && !isEditCopy ? (
        <Button
          icon="task_alt"
          variant="ghost"
          onClick={handleComplete}
          loading={completing}
          label="סיום"
        />
      ) : canEdit && isCompleted && !isEditCopy ? (
        <Button
          icon="upload"
          variant="ghost"
          onClick={handleComplete}
          loading={completing}
          label="העלה מחדש"
        />
      ) : null}

      <div className="w-px h-8 bg-surface-variant"></div>

      <Link
        href="/library/dashboard"
        className="flex items-center justify-center hover:opacity-80 transition-opacity"
        title={session?.user?.name}
      >
        <div
          className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-base shadow-md hover:shadow-lg transition-shadow"
          style={{ backgroundColor: getAvatarColor(session?.user?.name || '') }}
        >
          {getInitial(session?.user?.name || '')}
        </div>
      </Link>
    </div>
  )

  return (
    <>
      <DictaEditorCore 
        initialContent={book.content || ''}
        title={book.title}
        debugContext={{ bookId, status: book.status, isEditCopy }}
        canEdit={canEdit}
        isCompleted={isCompleted}
        onSave={handleSaveToServer}
        saving={saving}
        hasUnsavedChangesOuter={hasUnsavedChanges}
        setHasUnsavedChanges={setHasUnsavedChanges}
        headerStartElement={headerStart}
        headerEndElement={headerEnd}
      />

      {showUploadDialog && (
        <UploadDialog
          bookTitle={book?.title}
          onConfirm={handleUploadConfirm}
          onCancel={() => setShowUploadDialog(false)}
        />
      )}

      {showResetDialog && (
        <ResetDialog
          bookTitle={book?.title}
          onConfirm={handleResetConfirm}
          onCancel={() => setShowResetDialog(false)}
          loading={resetting}
          isEditCopy={isEditCopy}
        />
      )}

      {showDeleteDialog && (
        <DeleteDialog
          bookTitle={book?.title}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteDialog(false)}
          loading={deleting}
        />
      )}
    </>
  )
}

function UploadDialog({ bookTitle, onConfirm, onCancel }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        onConfirm()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onConfirm, onCancel])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-green-600">upload_file</span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">סיום עבודה על {bookTitle}</h2>
          <p className="text-on-surface/70">האם ברצונך להעלות את הטקסט שערכת למערכת?</p>
        </div>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-600 mt-0.5">info</span>
            <div className="text-sm text-blue-800">
              <p className="font-bold mb-1">מה יקרה?</p>
              <ul className="space-y-1">
                <li>• הטקסט שערכת יועלה כקובץ חדש</li>
                <li>• הקובץ יסומן כ"דיקטה" ויישלח לאישור מנהל</li>
                <li>• הספר יסומן כהושלם</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={onConfirm} className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold">
            <span className="material-symbols-outlined">upload</span>
            <span>כן, העלה את הטקסט</span>
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-3 border-2 border-surface-variant text-on-surface rounded-lg hover:bg-surface transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

function ResetDialog({ bookTitle, onConfirm, onCancel, loading, isEditCopy }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-red-600">warning</span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">אפס עריכת ספר</h2>
          <p className="text-on-surface/70 font-bold">{bookTitle}</p>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-red-600 mt-0.5">error</span>
            <div className="text-sm text-red-800">
              <p className="font-bold mb-2">אזהרה: פעולה בלתי הפיכה!</p>
              <ul className="space-y-1">
                <li>• כל העריכות שביצעת יימחקו לצמיתות</li>
                {isEditCopy ? (
                  <li>• הספר יחזור למצבו המקורי מההעלאות</li>
                ) : (
                  <li>• הספר יחזור למצבו המקורי מגיטהאב</li>
                )}
                <li>• לא ניתן לשחזר את השינויים לאחר האיפוס</li>
              </ul>
              <p className="mt-3 font-bold">האם אתה בטוח שברצונך להמשיך?</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button 
            onClick={onConfirm} 
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                <span>מאפס...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">restart_alt</span>
                <span>כן, אפס את הספר</span>
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-3 border-2 border-surface-variant text-on-surface rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteDialog({ bookTitle, onConfirm, onCancel, loading }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="glass-strong rounded-2xl p-8 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-4xl text-red-600">delete_forever</span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface mb-2">מחיקת עותק עריכה</h2>
          <p className="text-on-surface/70 font-bold">{bookTitle}</p>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-red-600 mt-0.5">error</span>
            <div className="text-sm text-red-800">
              <p className="font-bold mb-2">אזהרה: פעולה בלתי הפיכה!</p>
              <ul className="space-y-1">
                <li>• עותק העריכה יימחק לצמיתות</li>
                <li>• כל העריכות שביצעת יאבדו</li>
                <li>• ההעלאות המקוריות יישארו ללא שינוי</li>
                <li>• לא ניתן לשחזר את העותק לאחר המחיקה</li>
              </ul>
              <p className="mt-3 font-bold">האם אתה בטוח שברצונך למחוק?</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <button 
            onClick={onConfirm} 
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                <span>מוחק...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">delete_forever</span>
                <span>כן, מחק את העותק</span>
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-6 py-3 border-2 border-surface-variant text-on-surface rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}