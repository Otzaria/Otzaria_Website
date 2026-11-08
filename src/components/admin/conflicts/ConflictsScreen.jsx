'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import EmptyState from '@/components/ui/EmptyState'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import AdminScreenHeader from '@/components/admin/list/AdminScreenHeader'
import LoadError from '@/components/admin/list/LoadError'
import { errorToast } from '@/components/admin/list/adminRequest'
import { useListData } from '@/components/admin/list/useListData'
import { CONFLICTS_DESCRIPTION, CONFLICTS_TITLE, conflictBookName, conflictsCountText, resolveBookConfirm, resolvedBookMessage } from '@/lib/adminSuggestions/conflictTerms'
import { listConflicts, resolveConflictBook } from './conflictsApi'
import WorkspaceLink from '@/components/admin/dictaEdit/WorkspaceLink'
import ConflictBookRow, { conflictRowId } from './ConflictBookRow'
import { ConflictsListSkeleton } from './ConflictsSkeleton'

const TITLE_ID = 'conflicts-title'
const LIST_ID = 'conflicts-list'

/** ספר שיוצא מהרשימה ובו הפוקוס — הפוקוס עובר לספר הבא (או הקודם, או הרשימה), לא לתחילת הדף */
function moveFocusFrom(bookId) {
  const row = document.getElementById(conflictRowId(bookId))
  if (!row || !row.contains(document.activeElement)) return
  const target = row.nextElementSibling || row.previousElementSibling || document.getElementById(LIST_ID)
  target?.focus({ preventScroll: true })
}

/**
 * "התנגשויות בסנכרון" (/library/dicta-edit/conflicts), בתוך מעטפת הניהול. אותן בקשות לשרת כמו המסך הקודם.
 * רשימת הספרים; פתיחת ספר מציגה את החלקים השונים, והחלטה על כל חלק לחוד (עם כמה שניות של "בטל" לפני
 * שהבקשה יוצאת). פעולה על כל הספר — ב-⋮, עם חלון אישור. ספר שכל החלקים שלו הוכרעו יוצא מהרשימה, והפוקוס
 * עובר לספר הבא.
 * מי שינה כל נוסח ומתי — השרת (conflict-diff) לא מחזיר; רשום כבקשה עתידית ב-refactor-notes/DOUBTS.md.
 */
export default function ConflictsScreen() {
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const data = useListData(listConflicts, {
    onRefreshError: (_, retry) => toast.show({ tone: 'error', message: 'לא הצלחנו לרענן את הרשימה. ייתכן שמה שמוצג לא מעודכן.', action: { label: 'נסה שוב', onClick: retry } }),
  })
  const { items: books, setItems, refresh } = data
  const [busy, setBusy] = useState(() => new Set())
  const booksRef = useRef(books)
  useEffect(() => { booksRef.current = books })

  // אחרי החלטה על חלק: נפתר — הספר יוצא מהרשימה; אחרת — מונה החלקים שנשארו (בלי לטעון את כל הרשימה)
  const onResolved = useCallback((bookId, result) => {
    if (!result.resolved) {
      setItems((list) => list.map((b) => (b._id === bookId ? { ...b, conflictCount: result.conflictCount } : b)))
      return
    }
    const book = booksRef.current.find((b) => b._id === bookId)
    if (book) toast.show({ message: `כל החלקים ב"${conflictBookName(book)}" הוכרעו` })
    moveFocusFrom(bookId)
    setItems((list) => list.filter((b) => b._id !== bookId))
  }, [setItems, toast])

  const onError = useCallback((error) => toast.show(errorToast(error, 'לא הצלחנו לשמור את הבחירה.')), [toast])

  const onResolveBook = useCallback(async (book, strategy, prepare) => {
    if (!(await confirm(resolveBookConfirm(book, strategy)))) return
    setBusy((s) => new Set([...s, book._id]))
    try {
      await prepare()
      await resolveConflictBook(book._id, strategy)
      moveFocusFrom(book._id)
      setItems((list) => list.filter((b) => b._id !== book._id))
      toast.show({ message: resolvedBookMessage(book, strategy) })
      refresh()
    } catch (error) {
      toast.show(errorToast(error, 'לא הצלחנו לעדכן את הספר.'))
    } finally {
      setBusy((s) => {
        const next = new Set(s)
        next.delete(book._id)
        return next
      })
    }
  }, [confirm, setItems, toast, refresh])

  const refreshAll = async () => {
    if (await refresh()) toast.show({ message: 'הרשימה עודכנה' })
  }

  return (
    <div className="flex flex-col gap-5">
      <AdminScreenHeader
        id={TITLE_ID}
        title={CONFLICTS_TITLE}
        description={CONFLICTS_DESCRIPTION}
        action={<WorkspaceLink />}
        menuItems={[{ id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: refreshAll }]}
      />

      {data.status === 'loading' && (
        <div aria-busy="true">
          <p role="status" className="sr-only">טוען את הספרים…</p>
          <ConflictsListSkeleton />
        </div>
      )}
      {data.status === 'error' && (
        <LoadError error={data.error} title="לא הצלחנו לטעון את הספרים" sessionText="התחבר מחדש כדי לראות את הספרים. אחרי ההתחברות תחזור לכאן." onRetry={data.retry} />
      )}
      {data.status === 'ready' && (
        <section id={LIST_ID} tabIndex={-1} aria-labelledby={TITLE_ID} className="flex min-w-0 flex-col gap-3 outline-none">
          {books.length === 0 ? (
            <EmptyState icon="task_alt" title="אין ספרים שמחכים להחלטה" description="כשספר ישתנה גם באתר וגם במאגר, הוא יופיע כאן." />
          ) : (
            <>
              <p className="flex min-h-14 items-center px-1 text-body-sm tabular-nums text-on-surface-variant sm:px-2">{conflictsCountText(books.length)}</p>
              <ul aria-label="הספרים שמחכים להחלטה" className="flex flex-col gap-3">
                {books.map((book) => (
                  <ConflictBookRow key={book._id} book={book} busy={busy.has(book._id)} onResolved={onResolved} onError={onError} onResolveBook={onResolveBook} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {confirmElement}
    </div>
  )
}
