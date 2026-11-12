'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'
import DictaEditorCore from '@/components/editor/DictaEditorCore'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Loader from '@/components/ui/Loader'
import MenuButton from '@/components/ui/MenuButton'
import Tooltip from '@/components/ui/Tooltip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ErrorState from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/Toast'
import { cx } from '@/components/ui/cx'
import { FOCUS_RING } from '@/components/ui/focusRing'
import { hasBooksAccess } from '@/lib/roles'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import { send, AdminApiError } from '@/components/admin/list/adminRequest'
import { buildDownloadFilename } from './downloadFilename'

const UPLOADS_PATH = '/library/admin/uploads'
// הורדת הספר כולו — יותר זמן מבקשה רגילה (send של adminRequest: תקרת זמן, והתחברות שפגה = שגיאה ולא "הצלחה")
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000
// השמירה שולחת את כל תוכן הספר — ספר גדול בחיבור איטי צריך יותר מ-30 השניות הרגילות
const SAVE_TIMEOUT_MS = 5 * 60 * 1000

// העורך נפרש על כל המסך מעל מסגרת פאנל הניהול (ה-layout של /library/admin). רקע הדף (טוקן) — כמו
// מסך הטעינה (loading.jsx), כך שאין הבהוב גוון במעבר
const SHELL_CLASS = 'fixed inset-0 z-(--z-overlay) bg-background'

export default function EditCopyEditorPage() {
  const params = useParams()
  const router = useRouter()
  const { session, status } = useRequireAuth()
  const toast = useToast()
  const editCopyId = params?.id

  const [book, setBook] = useState(null)
  // loading / ready / not-found (404 — נמחק או כתובת שגויה) / error (השרת לא ענה כמו שצריך)
  const [loadState, setLoadState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const stateRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [leaveTarget, setLeaveTarget] = useState(null)

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
          // דיאלוג אישור במקום window.confirm: עוצרים את הניווט, ואם מאשרים — מנווטים בעצמנו
          e.preventDefault()
          e.stopPropagation()
          setLeaveTarget(targetUrl.pathname + targetUrl.search + targetUrl.hash)
        }
      }
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (status === 'loading' || status === 'unauthenticated' || !editCopyId) return
    let cancelled = false
    send(apiBase)
      .then(async (res) => {
        if (res.status === 404) return { state: 'not-found' }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return { state: 'ready', data: await res.json() }
      })
      .then(({ state, data }) => {
        if (cancelled) return
        if (data) setBook(data)
        setLoadState(state)
      })
      .catch((error) => {
        console.error('Error loading edit copy:', error)
        if (!cancelled) setLoadState('error')
      })
    return () => { cancelled = true }
  }, [apiBase, editCopyId, status, attempt])

  // "לא נמצא" / שגיאה מחליפים את כל המסך — הפוקוס לכותרת שלהם, ולא נשאר על body
  useEffect(() => {
    if (loadState !== 'not-found' && loadState !== 'error') return
    const heading = stateRef.current?.querySelector('h1, h2')
    if (!heading) return
    heading.tabIndex = -1
    heading.classList.add('outline-none')
    heading.focus()
  }, [loadState])

  const retryLoad = () => {
    setLoadState('loading')
    setAttempt((n) => n + 1)
  }

  const handleSaveToServer = async (currentContent, silent = false) => {
    try {
      setSaving(true)
      const res = await send(apiBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentContent }),
        timeoutMs: SAVE_TIMEOUT_MS
      })

      if (!res.ok) throw new Error('שגיאה בשמירה')

      setBook(prev => ({ ...prev, content: currentContent }))
      setHasUnsavedChanges(false)

      if (!silent) toast.show({ message: 'העריכה נשמרה' })
    } catch (error) {
      console.error('Error saving edit copy:', error)
      // התחברות שפגה / אין חיבור / השרת לא עונה — ההודעה המדויקת; אחרת הודעה כללית
      const message = error instanceof AdminApiError ? error.message : 'לא הצלחנו לשמור את עותק העריכה. נסה שוב.'
      toast.show({ tone: 'error', message })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true)
      const res = await send(apiBase, { method: 'DELETE' })

      if (res.ok) {
        // ההודעה שורדת את המעבר (ToastProvider במעטפת)
        toast.show({ message: `עותק העריכה של "${book?.title || ''}" נמחק` })
        router.push(UPLOADS_PATH)
      } else {
        toast.show({ tone: 'error', message: 'לא הצלחנו למחוק את עותק העריכה. נסה שוב.' })
      }
    } catch (error) {
      console.error('Error deleting edit copy:', error)
      toast.show({ tone: 'error', message: 'לא הצלחנו למחוק את עותק העריכה. נסה שוב.' })
    } finally {
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const handleDownloadSavedBook = async () => {
    try {
      setDownloading(true)
      const response = await send(`${apiBase}/download`, { timeoutMs: DOWNLOAD_TIMEOUT_MS })

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
      toast.show({ tone: 'error', message: 'לא הצלחנו להוריד את הספר. נסה שוב.' })
    } finally {
      setDownloading(false)
    }
  }

  const handleResetConfirm = async () => {
    try {
      setResetting(true)
      const res = await send(`${apiBase}/reset`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || 'שגיאה באיפוס עותק העריכה')
      }

      setBook(prev => ({ ...prev, content: data.book.content }))
      setHasUnsavedChanges(false)
      setShowResetDialog(false)
      toast.show({ message: 'עותק העריכה חזר לתוכן של ההעלאות' })
    } catch (error) {
      console.error('Error resetting edit copy:', error)
      toast.show({ tone: 'error', message: 'לא הצלחנו לאפס את עותק העריכה. נסה שוב.' })
    } finally {
      setResetting(false)
    }
  }

  if (loadState === 'loading') {
    return (
      <div className={`${SHELL_CLASS} flex items-center justify-center`}>
        <Loader size="md" label="טוען את עותק העריכה…" />
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div ref={stateRef} className={`${SHELL_CLASS} flex items-center justify-center p-4`}>
        <ErrorState
          title="לא הצלחנו לטעון את עותק העריכה"
          description="השרת לא ענה כמו שצריך. נסה שוב בעוד רגע."
          onRetry={retryLoad}
          className="w-full max-w-lg"
        />
      </div>
    )
  }

  if (loadState === 'not-found' || !book) {
    return (
      <div ref={stateRef} className={`${SHELL_CLASS} flex items-center justify-center p-4`}>
        <EmptyState
          as="h1"
          icon="search_off"
          title="עותק העריכה לא נמצא"
          description="ייתכן שהוא נמחק. אפשר ליצור עותק חדש מהספר במסך ההעלאות."
          actions={<Button href={UPLOADS_PATH} variant="outlined" size="sm" icon="arrow_forward">חזרה להעלאות</Button>}
          className="w-full max-w-lg"
        />
      </div>
    )
  }

  // המסגרת סביב העורך: פירור "העלאות ›" (העורך מוסיף אחריו את שם הספר), ובקצה — "עותק עריכה",
  // "הורד ספר", ⋮ (אפס, ואחרי מפריד מחיקה לצמיתות) והאזור האישי. העורך עצמו לא השתנה.
  const headerStart = (
    <>
      <Link href="/library" aria-label="הספרייה" className={cx('flex shrink-0 items-center rounded-(--radius-control)', FOCUS_RING)}>
        <img src="/logo.png" alt="" className="size-8" />
      </Link>
      <nav aria-label="מיקום" className="flex items-center gap-1 text-body-md">
        <Link href={UPLOADS_PATH} className={cx('rounded-(--radius-control) px-1.5 py-1 text-on-surface-variant hover:bg-surface-selected hover:text-on-surface', FOCUS_RING)}>
          העלאות
        </Link>
        <span aria-hidden="true" className="text-on-surface-variant">›</span>
      </nav>
    </>
  )

  const menuItems = canEdit ? [
    { id: 'reset', icon: 'restart_alt', label: 'אפס עותק', onSelect: () => setShowResetDialog(true) },
    { separator: true, id: 'sep' },
    { id: 'delete', icon: 'delete_forever', label: 'מחק עותק לצמיתות', danger: true, onSelect: () => setShowDeleteDialog(true) },
  ] : []

  const headerEnd = (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline-flex"><Badge tone="primary" icon="content_copy">עותק עריכה</Badge></span>
      <Tooltip content="מוריד את הגרסה השמורה בלבד, בלי שינויים שלא נשמרו">
        <Button variant="text" size="sm" icon="download" onClick={handleDownloadSavedBook} loading={downloading || resetting || deleting}>
          {/* בטלפון — אייקון בלבד (השם נשאר לקורא המסך), כדי שהכותרת לא תידחק */}
          <span className="sr-only sm:not-sr-only">הורד ספר</span>
        </Button>
      </Tooltip>
      {menuItems.length > 0 && <MenuButton label="עוד פעולות על העותק" items={menuItems} />}
      <Link
        href="/library/dashboard"
        aria-label={`האזור האישי (${session?.user?.name || ''})`}
        className={cx('flex shrink-0 items-center justify-center rounded-full', FOCUS_RING)}
      >
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full text-label-lg text-white"
          style={{ backgroundColor: getAvatarColor(session?.user?.name || '') }}
        >
          {getInitial(session?.user?.name || '')}
        </span>
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
        <ConfirmDialog
          tone="danger"
          title="לאפס את עותק העריכה?"
          body={<>העותק של <strong className="text-on-surface"><bdi>{book.title}</bdi></strong> יחזור לתוכן המקורי מההעלאות.</>}
          details={['כל העריכות שעשית בו יימחקו', 'אי אפשר לבטל את האיפוס']}
          confirmLabel="אפס עותק"
          busyLabel="מאפס…"
          busy={resetting}
          onConfirm={handleResetConfirm}
          onCancel={() => setShowResetDialog(false)}
        />
      )}

      {leaveTarget && (
        <ConfirmDialog
          title="לצאת בלי לשמור?"
          body="יש שינויים שלא נשמרו. אם תצא עכשיו, הם יאבדו."
          confirmLabel="צא בלי לשמור"
          cancelLabel="הישאר"
          tone="danger"
          onCancel={() => setLeaveTarget(null)}
          onConfirm={() => {
            const target = leaveTarget
            setLeaveTarget(null)
            setHasUnsavedChanges(false)
            router.push(target)
          }}
        />
      )}

      {showDeleteDialog && (
        <ConfirmDialog
          tone="danger"
          title="למחוק לצמיתות את עותק העריכה?"
          body={<>עותק העריכה של <strong className="text-on-surface"><bdi>{book.title}</bdi></strong> יימחק, עם כל העריכות שבו.</>}
          details={['ההעלאות המקוריות לא משתנות', 'אי אפשר לשחזר את העותק']}
          confirmLabel="מחק לצמיתות"
          busyLabel="מוחק…"
          busy={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </div>
  )
}
