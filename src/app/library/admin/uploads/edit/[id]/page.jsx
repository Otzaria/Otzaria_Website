'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/ui/legacy/LegacyButton'
import { useDialog } from '@/components/providers/DialogContext'
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'
import DictaEditorCore from '@/components/editor/DictaEditorCore'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { hasBooksAccess } from '@/lib/roles'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import EditCopyConfirmDialog from './EditCopyConfirmDialog'
import { buildDownloadFilename } from './downloadFilename'

const UPLOADS_PATH = '/library/admin/uploads'

// העורך נפרש על כל המסך מעל מסגרת פאנל הניהול (ה-layout של /library/admin)
const SHELL_CLASS = 'fixed inset-0 z-(--z-overlay) bg-neutral-50'

export default function EditCopyEditorPage() {
  const params = useParams()
  const router = useRouter()
  const { session, status } = useRequireAuth()
  const { showAlert } = useDialog()
  const editCopyId = params?.id

  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const canEdit = hasBooksAccess(session?.user?.role)
  const apiBase = `/api/admin/uploads/edit-copy/${editCopyId}`

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

  useEffect(() => {
    if (status === 'loading' || status === 'unauthenticated' || !editCopyId) return
    let cancelled = false
    fetch(apiBase)
      .then((res) => {
        if (!res.ok) throw new Error('שגיאה בטעינת עותק העריכה')
        return res.json()
      })
      .then((data) => {
        if (!cancelled) setBook(data)
      })
      .catch((error) => {
        console.error('Error loading edit copy:', error)
        if (!cancelled) showAlert('שגיאה', 'שגיאה בטעינת עותק העריכה')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [apiBase, editCopyId, status, showAlert])

  const handleSaveToServer = async (currentContent, silent = false) => {
    try {
      setSaving(true)
      const res = await fetch(apiBase, {
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
      console.error('Error saving edit copy:', error)
      showAlert('שגיאה', 'שגיאה בשמירת עותק העריכה')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true)
      const res = await fetch(apiBase, { method: 'DELETE' })

      if (res.ok) {
        showAlert('הצלחה', 'עותק העריכה נמחק בהצלחה')
        router.push(UPLOADS_PATH)
      } else {
        const data = await res.json().catch(() => ({}))
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

  const handleDownloadSavedBook = async () => {
    try {
      setDownloading(true)
      const response = await fetch(`${apiBase}/download`)

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'שגיאה בהורדת הספר')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const contentDisposition = response.headers.get('content-disposition') || ''
      const filenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
      const filename = decodeURIComponent(filenameMatch?.[1] || filenameMatch?.[2] || buildDownloadFilename(book?.title))

      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading edit copy:', error)
      showAlert('שגיאה', error.message || 'שגיאה בהורדת הספר')
    } finally {
      setDownloading(false)
    }
  }

  const handleResetConfirm = async () => {
    try {
      setResetting(true)
      const res = await fetch(`${apiBase}/reset`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || 'שגיאה באיפוס עותק העריכה')
      }

      setBook(prev => ({ ...prev, content: data.book.content }))
      setHasUnsavedChanges(false)
      setShowResetDialog(false)
      showAlert('הצלחה', data.message || 'עותק העריכה אופס בהצלחה מההעלאות המקוריות.')
    } catch (error) {
      console.error('Error resetting edit copy:', error)
      showAlert('שגיאה', error.message || 'אירעה שגיאה באיפוס עותק העריכה')
    } finally {
      setResetting(false)
    }
  }

  if (loading) {
    return (
      <div className={`${SHELL_CLASS} flex items-center justify-center`}>
        <LoadingSpinner message="טוען נתונים..." />
      </div>
    )
  }

  if (!book) {
    return (
      <div className={`${SHELL_CLASS} flex flex-col items-center justify-center gap-4`}>
        <div className="text-xl text-danger-600">עותק העריכה לא נמצא</div>
        <Link href={UPLOADS_PATH} className="text-primary underline">חזרה להעלאות</Link>
      </div>
    )
  }

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
        onClick={() => router.push(UPLOADS_PATH)}
        label="חזרה להעלאות"
      />
      <div className="w-px h-8 bg-surface-variant"></div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-feature-100 text-feature-700 rounded-lg text-sm">
        <span className="material-symbols-outlined text-sm">content_copy</span>
        <span>עותק עריכה</span>
      </div>
      <div className="w-px h-8 bg-surface-variant"></div>
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
        <>
          <Button
            icon="restart_alt"
            variant="ghost"
            size="sm"
            onClick={() => setShowResetDialog(true)}
            loading={resetting}
            label="אפס ספר"
          />
          <Button
            icon="delete"
            variant="ghost"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            loading={deleting}
            label="מחק עותק"
          />
        </>
      )}

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
    <div className={SHELL_CLASS}>
      <DictaEditorCore
        initialContent={book.content || ''}
        title={book.title}
        canEdit={canEdit}
        onSave={handleSaveToServer}
        saving={saving}
        hasUnsavedChangesOuter={hasUnsavedChanges}
        setHasUnsavedChanges={setHasUnsavedChanges}
        headerStartElement={headerStart}
        headerEndElement={headerEnd}
      />

      {showResetDialog && (
        <EditCopyConfirmDialog
          icon="restart_alt"
          heading="איפוס עותק העריכה"
          bookTitle={book.title}
          warnings={[
            'כל העריכות שביצעת יימחקו לצמיתות',
            'העותק יחזור לתוכן המקורי מההעלאות',
            'לא ניתן לשחזר את השינויים לאחר האיפוס',
          ]}
          question="האם אתה בטוח שברצונך להמשיך?"
          confirmLabel="כן, אפס את העותק"
          loadingLabel="מאפס..."
          onConfirm={handleResetConfirm}
          onCancel={() => setShowResetDialog(false)}
          loading={resetting}
        />
      )}

      {showDeleteDialog && (
        <EditCopyConfirmDialog
          icon="delete_forever"
          heading="מחיקת עותק עריכה"
          bookTitle={book.title}
          warnings={[
            'עותק העריכה יימחק לצמיתות',
            'כל העריכות שביצעת יאבדו',
            'ההעלאות המקוריות יישארו ללא שינוי',
            'לא ניתן לשחזר את העותק לאחר המחיקה',
          ]}
          question="האם אתה בטוח שברצונך למחוק?"
          confirmLabel="כן, מחק את העותק"
          loadingLabel="מוחק..."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteDialog(false)}
          loading={deleting}
        />
      )}
    </div>
  )
}
