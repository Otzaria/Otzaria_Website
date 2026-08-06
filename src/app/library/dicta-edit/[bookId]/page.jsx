'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import { useDialog } from '@/components/providers/DialogContext'
import { getAvatarColor, getInitial } from '@/lib/avatar-colors'
import DictaEditorCore from '@/components/editor/DictaEditorCore'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { applyHunks } from '@/lib/dicta/text-diff'
import { EDIT_TYPES } from '@/lib/dicta/edit-constants'

function LibraryEditorContent() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const { showAlert } = useDialog()
  const bookId = params?.bookId
  // קטע למיקוד אוטומטי — מגיע מקישור עמוק (למשל מדיווח שגיאה באוצריא)
  const initialFind = searchParams.get('find') || ''

  const [book, setBook] = useState(null)
  const [seedContent, setSeedContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [editType, setEditType] = useState('')
  const [showFindReplace, setShowFindReplace] = useState(false)

  useEffect(() => {
    const handler = (e) => { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  const loadBook = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/library/books/${bookId}`)
      if (!res.ok) throw new Error('שגיאה בטעינת הספר')
      const data = await res.json()
      setBook(data)
      // משתמש רגיל עם טיוטה ממתינה — נמשיך מהמקום שלו
      if (data.myPending?.changes?.length) {
        const { content } = applyHunks(data.content || '', data.myPending.changes)
        setSeedContent(content)
      } else {
        setSeedContent(data.content || '')
      }
    } catch (error) {
      console.error(error)
      showAlert('שגיאה', 'שגיאה בטעינת הספר')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      // שימור ה-query (למשל ?find=קטע מדיווח) כדי שהמיקוד לא יאבד אחרי ההתחברות
      const query = searchParams.toString()
      const callbackUrl = query ? `${pathname}?${query}` : pathname
      router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
      return
    }
    if (bookId) loadBook()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, status])

  const handleSave = async (currentContent) => {
    try {
      setSaving(true)
      const res = await fetch(`/api/library/books/${bookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: currentContent, editType: editType || null, baseVersion: book?.version }),
      })
      const data = await res.json()
      if (res.status === 409 && data.code === 'STALE') {
        showAlert('הספר עודכן בינתיים', 'מישהו אחר שמר שינויים בספר זה. עריכותיך הנוכחיות עדיין כאן ולא נשמרו — העתק אותן, רענן את הדף כדי לראות את הגרסה העדכנית, ושלב מחדש.')
        return
      }
      if (!res.ok) throw new Error(data.error || 'שגיאה בשמירה')

      setHasUnsavedChanges(false)
      if (data.status === 'nochange') {
        showAlert('אין שינוי', 'לא זוהו שינויים לעומת הגרסה הנוכחית.')
      } else if (data.status === 'applied') {
        setBook((p) => ({ ...p, content: currentContent, version: data.version }))
        showAlert('נשמר', `התיקון הוחל ונשמר בהצלחה (${data.changeCount} שינויים).`)
      } else {
        showAlert('נשלח לאישור', 'ההצעה נשלחה למפקחים לאישור. תודה על התרומה!')
      }
    } catch (error) {
      console.error(error)
      showAlert('שגיאה', error.message || 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  const canEditDirect = !!book?.canEditDirect
  const blocked = !!book?.blocked
  const canEdit = !blocked

  const headerStart = useMemo(() => (
    <>
      <Link href="/library" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <img src="/logo.png" alt="לוגו אוצריא" className="w-10 h-10" />
        <span className="text-lg font-bold text-black" style={{ fontFamily: 'FrankRuehl, serif' }}>ספריית אוצריא</span>
      </Link>
      <div className="w-px h-8 bg-surface-variant"></div>
      <Button icon="arrow_forward" variant="ghost" onClick={() => router.push('/library/dicta-edit')} label="חזרה למרחב" />
      <div className="w-px h-8 bg-surface-variant"></div>
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${canEditDirect ? 'bg-success-alt-100 text-success-alt-700' : 'bg-warning-100 text-warning-700'}`}>
        <span className="material-symbols-outlined text-sm">{canEditDirect ? 'verified_user' : 'rate_review'}</span>
        <span>{canEditDirect ? 'עריכה ישירה' : 'מצב הצעות'}</span>
      </div>
    </>
  ), [canEditDirect, router])

  const headerEnd = (
    <div className="flex items-center gap-3">
      <select
        value={editType}
        onChange={(e) => setEditType(e.target.value)}
        title="סוג התיקון (אופציונלי)"
        className="text-sm border border-neutral-cool-200 rounded-lg px-2 py-1.5 bg-white"
      >
        <option value="">סוג תיקון (אופציונלי)</option>
        {EDIT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      {canEdit && (
        <Button icon="find_replace" variant="ghost" size="sm" onClick={() => setShowFindReplace(true)} label="חפש והחלף" />
      )}

      <div className="w-px h-8 bg-surface-variant"></div>
      <Link href="/library/dashboard" prefetch={false} className="flex items-center justify-center hover:opacity-80 transition-opacity" title={session?.user?.name}>
        <div className="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-base shadow-md"
          style={{ backgroundColor: getAvatarColor(session?.user?.name || '') }}>
          {getInitial(session?.user?.name || '')}
        </div>
      </Link>
    </div>
  )

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingSpinner message="טוען ספר..." /></div>
  }
  if (!book) {
    return <div className="flex items-center justify-center min-h-screen"><div className="text-xl text-danger-600">הספר לא נמצא</div></div>
  }

  return (
    <>
      {blocked && (
        <div className="bg-danger-600 text-white text-center py-2 text-sm font-medium">
          חשבונך חסום מעריכה במרחב זה. ניתן לצפות בלבד.
        </div>
      )}
      {!canEditDirect && !blocked && (
        <div className="bg-warning-50 border-b border-warning-200 text-warning-800 text-center py-2 text-sm">
          עריכותיך יישמרו כ<strong>הצעת תיקון</strong> וייכנסו לספר רק לאחר אישור מפקח. ניתן לערוך בחופשיות — לא ניתן לקלקל את הספר.
        </div>
      )}

      <DictaEditorCore
        initialContent={seedContent}
        initialFind={initialFind}
        title={book.title}
        canEdit={canEdit}
        isCompleted={false}
        onSave={handleSave}
        saving={saving}
        saveLabel={canEditDirect ? 'שמירה' : 'שלח הצעת תיקון'}
        hasUnsavedChangesOuter={hasUnsavedChanges}
        setHasUnsavedChanges={setHasUnsavedChanges}
        headerStartElement={headerStart}
        headerEndElement={headerEnd}
      />

      {showFindReplace && (
        <FindReplaceCorrectionModal
          bookId={bookId}
          canEditDirect={canEditDirect}
          onClose={() => setShowFindReplace(false)}
          onApplied={() => { setShowFindReplace(false); loadBook() }}
          onProposed={() => setShowFindReplace(false)}
        />
      )}
    </>
  )
}

// עטיפת Suspense — נדרשת ל-useSearchParams ב-Next.js כדי למנוע שגיאת build
export default function LibraryEditorPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner message="טוען ספר..." /></div>}>
      <LibraryEditorContent />
    </Suspense>
  )
}

function FindReplaceCorrectionModal({ bookId, canEditDirect, onClose, onApplied, onProposed }) {
  const { showAlert } = useDialog()
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [flags, setFlags] = useState('')
  const [editType, setEditType] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!find) return showAlert('שגיאה', 'יש להזין טקסט לחיפוש')
    try {
      setBusy(true)
      const res = await fetch(`/api/library/books/${bookId}/find-replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ find, replace, isRegex, flags, caseSensitive, editType: editType || null, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה')
      if (data.status === 'nochange') {
        showAlert('אין התאמות', 'לא נמצאו התאמות לתבנית בספר.')
        setBusy(false)
        return
      }
      if (data.status === 'applied') {
        showAlert('הוחל', `ההחלפה הוחלה (${data.changeCount} מקטעים).`)
        onApplied()
      } else {
        showAlert('נשלח לאישור', 'ההצעה (חיפוש-והחלפה) נשלחה למפקחים.')
        onProposed()
      }
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()} dir="rtl">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">find_replace</span>
          חיפוש והחלפה בכל הספר
        </h2>
        <p className="text-sm text-neutral-cool-500 mb-4">
          {canEditDirect ? 'ההחלפה תוחל מיד על הספר.' : 'ההחלפה תישלח כהצעה לאישור מפקח.'}
        </p>

        <label className="block text-sm font-medium mb-1">חיפוש</label>
        <input value={find} onChange={(e) => setFind(e.target.value)} className="w-full border border-neutral-cool-200 rounded-lg px-3 py-2 mb-3 font-mono" />

        <label className="block text-sm font-medium mb-1">החלפה</label>
        <input value={replace} onChange={(e) => setReplace(e.target.value)} className="w-full border border-neutral-cool-200 rounded-lg px-3 py-2 mb-3 font-mono" />

        <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
          <label className={`flex items-center gap-2 ${canEditDirect ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            title={canEditDirect ? '' : 'שימוש ב-regex מותר למפקחים בלבד'}>
            <input type="checkbox" checked={isRegex} disabled={!canEditDirect}
              onChange={(e) => setIsRegex(e.target.checked)} />
            ביטוי רגולרי (Regex){!canEditDirect && ' — למפקחים'}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
            תלוי רישיות
          </label>
          {isRegex && (
            <input value={flags} onChange={(e) => setFlags(e.target.value)} placeholder="flags (gimsuy)" className="border border-neutral-cool-200 rounded-lg px-2 py-1 w-28 font-mono" />
          )}
        </div>

        <div className="flex gap-3 mb-4">
          <select value={editType} onChange={(e) => setEditType(e.target.value)} className="flex-1 border border-neutral-cool-200 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="">סוג תיקון (אופציונלי)</option>
            {EDIT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה (אופציונלי)" className="flex-1 border border-neutral-cool-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="flex gap-3">
          <button onClick={submit} disabled={busy} className="flex-[2] bg-primary text-white py-2.5 rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50">
            {busy ? 'מעבד...' : canEditDirect ? 'החל החלפה' : 'שלח כהצעה'}
          </button>
          <button onClick={onClose} disabled={busy} className="flex-1 border border-neutral-cool-200 py-2.5 rounded-xl font-bold hover:bg-neutral-cool-50">ביטול</button>
        </div>
      </div>
    </div>
  )
}
