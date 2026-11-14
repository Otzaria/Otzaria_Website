'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ErrorState from '@/components/ui/ErrorState'
import ListPager from '@/components/admin/list/ListPager'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { loginHref } from '@/components/admin/list/adminRequest'
import { unsavedConfirm } from '@/hooks/useUnsavedChangesGuard'
import { useBulkLeaveGuard } from '@/components/admin/list/useBulkLeaveGuard'
import { emptyStateKind, safeColor } from '@/lib/adminBooks/bookTerms'
import {
  categoryOptions as buildCategoryOptions,
  clearFilters,
  filterBooks,
  hasActiveFilters,
  ownerOptions as buildOwnerOptions,
  paginate,
  sanitizeBooksQuery,
  serializeBooksQuery,
  sortBooks,
  statusOptions as buildStatusOptions,
  updateBooksQuery,
  visibilityOptions as buildVisibilityOptions,
} from '@/lib/adminBooks/booksQuery'
import AddBookDialog from './AddBookDialog'
import BookDrawer from './BookDrawer'
import BookRow from './BookRow'
import BooksBulkBar from './BooksBulkBar'
import BooksEmptyState from './BooksEmptyState'
import BooksFilterBar from './BooksFilterBar'
import BooksHeader, { BOOKS_TITLE_ID } from './BooksHeader'
import { BooksListSkeleton } from './BooksSkeleton'
import MergeBooksDialog from './MergeBooksDialog'
import QuotedName from './QuotedName'
import RenameBookDialog from './RenameBookDialog'
import ShowBookDialog from './ShowBookDialog'
import { useBookActions } from './useBookActions'
import { useBooksData } from './useBooksData'
import { useBooksQuery } from './useBooksQuery'
import { useKeyedSelection } from '@/components/admin/list/useKeyedSelection'
import { useFocusAfterRemove } from '@/components/admin/list/useFocusAfterRemove'
import { useDrawerParam } from '@/components/admin/list/useDrawerParam'

const LIST_ID = 'books-list'

/**
 * מסך הספרים (/library/admin/books): למצוא ספר מהר, לראות את מצבו, ולעשות עליו פעולה.
 *
 * מבנה (דפוס מסכי הרשימה של הניהול, כמו "העלאות"): כותרת עם פעולה ראשית אחת ("הוסף ספר") ו-⋮,
 * לשוניות (ספרים · קטגוריות · הנחיות כלליות · מנויים), סינון, שורת כלים / פעולות מרובות, רשימת שורות
 * (בלי כרטיסים: כריכה קטנה, שם, קטגוריה ובעלות, התקדמות, "פתח" ו-⋮), עימוד. "פתח" — מגירת הספר.
 * הסינון, העמוד והמגירה — בכתובת. ערכים לא חוקיים בכתובת מתוקנים בה, כך שהיא אומרת מה מוצג.
 *
 * הבחירה תמיד תת-קבוצה של מה שמוצג (חיתוך עם מה שמתאים לסינון), כך שאחרי "הסתר" תחת סינון
 * "בעבודה", למשל, אין "בחירת רפאים". היא מתאפסת בכל שינוי סינון, מיון או עמוד.
 * ההודעות הקופצות (useToast) — מהמעטפת.
 *
 * subscriberCount — כמה מנויים יקבלו הודעה כשספר מוצג לכולם (null — לא ידוע).
 * @param {{ initialBooks: any[], initialCategories: { name: string, color?: string }[], initialError?: boolean,
 *   subscriberCount?: number | null }} props
 */
export default function BooksScreen({ initialBooks, initialCategories, initialError = false, subscriberCount = null }) {
  const router = useRouter()
  const toast = useToast()
  const [confirm, confirmElement] = useConfirm()
  const [rawQuery, setQuery] = useBooksQuery()
  const { books, setBooks, categories, status: loadState, error, retry, refresh } = useBooksData({ initialBooks, initialCategories, initialError })
  const ready = loadState === 'ready'

  // ----- צבעי קטגוריות ואפשרויות הבוררים -----
  const colors = useMemo(() => new Map(categories.map((c) => [c.name, safeColor(c.color)])), [categories])
  const colorOf = useCallback((name) => colors.get(name) ?? null, [colors])
  const categoryOptions = useMemo(() => buildCategoryOptions(categories, books), [categories, books])
  const statusOptions = useMemo(() => buildStatusOptions(books), [books])
  const ownerOptions = useMemo(() => buildOwnerOptions(books), [books])
  const visibilityOptions = useMemo(() => buildVisibilityOptions(books), [books])
  // לבחירה (שינוי קטגוריה, הוספת ספר) — רק הקטגוריות שבהגדרות, בלי מספרים
  const pickCategoryOptions = useMemo(() => categoryOptions.filter((o) => !o.hint).map(({ count: _, ...o }) => o), [categoryOptions])

  // ----- השאילתה כפי שהיא חלה בפועל -----
  const query = useMemo(() => sanitizeBooksQuery(rawQuery, ready
    ? { categoryKeys: categoryOptions.map((o) => o.value), bookIds: books.map((b) => b.id) }
    : {}), [rawQuery, ready, categoryOptions, books])
  const filtersActive = hasActiveFilters(query)
  const filtered = useMemo(() => sortBooks(filterBooks(books, query), query.sort), [books, query])
  const page = paginate(filtered, query.page)
  const matchingIds = useMemo(() => filtered.map((b) => b.id), [filtered])
  const pageIds = page.items.map((b) => b.id)

  // קישור לספר שלא קיים (נמחק / מוזג): הכתובת מתנקה — ואומרים למה המגירה לא נפתחה (פעם אחת לכל מזהה)
  const missingBookNotice = useRef('')
  useEffect(() => {
    if (!ready || !rawQuery.book || query.book || missingBookNotice.current === rawQuery.book) return
    missingBookNotice.current = rawQuery.book
    toast.show({ tone: 'info', message: 'הספר שבקישור לא נמצא. ייתכן שנמחק או מוזג לספר אחר.' })
  }, [ready, rawQuery.book, query.book, toast])

  useEffect(() => {
    if (!ready) return
    const shown = { ...query, page: page.page }
    if (serializeBooksQuery(shown) !== serializeBooksQuery(rawQuery)) setQuery(shown)
  }, [ready, query, page.page, rawQuery, setQuery])

  // ----- בחירה: מתאפסת כשהסינון / העמוד משתנים, ותמיד חתוכה למה שמוצג -----
  const queryKey = JSON.stringify([query.q, query.status, query.vis, query.owner, query.cat, query.sort, page.page])
  const { ids: selectedIds, clearedText, select, clear: clearSelection } = useKeyedSelection(queryKey)
  const matchingSet = useMemo(() => new Set(matchingIds), [matchingIds])
  const selected = useMemo(() => {
    const out = new Set()
    for (const id of selectedIds) if (matchingSet.has(id)) out.add(id)
    return out
  }, [selectedIds, matchingSet])

  // ----- פוקוס: כשהאלמנט הממוקד ירד מהרשימה (מחיקה, יציאה מהסינון) — לשורה שבאה במקומה, לא ל-body -----
  const { listRef, onListFocus } = useFocusAfterRemove({ focusIn: '[data-row-focus]', fallbackId: LIST_ID })

  // ----- מגירה (בכתובת: book + view). פתיחה — push, כדי ש"אחורה" יסגור אותה -----
  const { openerRef, open: pushDrawer, close: popDrawer, markPushed } = useDrawerParam(setQuery)
  const openDrawer = useCallback((book, view = 'details') => {
    pushDrawer(book.id, updateBooksQuery(query, { book: book.id, view }))
  }, [query, pushDrawer])
  const [closingDrawer, setClosingDrawer] = useState(false)
  const closeDrawer = useCallback(() => {
    setClosingDrawer(true)
    popDrawer(updateBooksQuery(query, { book: '' }))
  }, [query, popDrawer])
  // הפוקוס חוזר ל"פתח" של השורה (גם כשהמגירה נפתחה מ-⋮, שכבר נסגר); ספר שנמחק — לרשימה
  const drawerReturnFocus = useCallback(() => {
    const row = listRef.current?.querySelector(`[data-row="${CSS.escape(openerRef.current || query.book)}"]`)
    return row?.querySelector('button[aria-label^="פתח"]') || document.getElementById(LIST_ID)
  }, [listRef, openerRef, query.book])

  // "אחורה" בדפדפן כשבמגירה יש הנחיות שלא נשמרו: הכתובת כבר בלי הספר, אבל המגירה נשארת פתוחה (held) —
  // אותו רכיב, כך שהטופס לא נמחק — ונשאלים. "הישאר" — הכתובת חוזרת למגירה; "צא" — המגירה נסגרת.
  // (אי אפשר לעצור את ה-popstate לפני הנתב של Next — ראו hooks/useUnsavedChangesGuard.)
  const [drawerDirty, setDrawerDirty] = useState(false)
  const [held, setHeld] = useState(null) // { id, view } — מגירה שנשארת פתוחה עד שהמשתמש עונה
  const [shown, setShown] = useState({ book: query.book, view: query.view })
  if (shown.book !== query.book || shown.view !== query.view) {
    if (shown.book && shown.book !== query.book && drawerDirty && !closingDrawer && !held) setHeld({ id: shown.book, view: shown.view })
    if (!query.book && closingDrawer) setClosingDrawer(false)
    setShown({ book: query.book, view: query.view })
  }
  if (held && query.book === held.id) setHeld(null)
  const askedFor = useRef(null)
  const latest = useRef({ query, setQuery, confirm })
  useEffect(() => { latest.current = { query, setQuery, confirm } })
  useEffect(() => {
    if (!held || askedFor.current === held) return
    askedFor.current = held
    const { confirm: ask } = latest.current
    ask(unsavedConfirm('השינויים בהנחיות העריכה לא נשמרו.'))
      .then((leave) => {
        if (leave) {
          setDrawerDirty(false)
          setHeld(null)
          return
        }
        markPushed()
        const { query: q, setQuery: set } = latest.current
        set(updateBooksQuery(q, { book: held.id, view: held.view }), { push: true })
      })
  }, [held, markPushed])
  const drawerId = held ? held.id : query.book
  const drawerView = held ? held.view : query.view
  const drawerBook = drawerId ? books.find((b) => b.id === drawerId) : null

  // ----- דיאלוגים -----
  const [dialog, setDialog] = useState(null) // { kind: 'add' | 'rename' | 'show' | 'merge', payload }
  const onDialog = useCallback((kind, payload) => setDialog({ kind, payload }), [])
  const closeDialog = useCallback(() => setDialog(null), [])

  const { actions, setHidden, saveDetails, bulk, pending, working, bulkProgress, stopBulk } = useBookActions({
    setBooks, toast, confirm, router, refresh, onDialog, onOpenDrawer: openDrawer,
  })
  // פעולה מרובה באמצע: יציאה מהמסך (קישור, "אחורה") שואלת, ו"עצור וצא" עוצר אותה; רענון / סגירה — אזהרת הדפדפן
  useBulkLeaveGuard({
    running: working,
    stop: stopBulk,
    drawerOpen: Boolean(rawQuery.book),
    confirm,
    body: 'הפעולה על הספרים שנבחרו עוד רצה. מה שכבר נשלח נשאר; מה שעוד לא נשלח — לא יישלח.',
  })

  // ----- סינון ועימוד -----
  const changeQuery = useCallback((patch) => setQuery(updateBooksQuery(query, patch)), [query, setQuery])
  const clearAll = useCallback(() => setQuery(clearFilters(query)), [query, setQuery])
  const goToPage = useCallback((n) => {
    setQuery(updateBooksQuery(query, { page: n }), { push: true })
    document.getElementById(LIST_ID)?.focus({ preventScroll: true })
    // בלי אנימציה למי שביקש פחות תנועה (scrollIntoView ב-JS לא מכבד את ה-CSS)
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(BOOKS_TITLE_ID)?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
  }, [query, setQuery])
  // הפוקוס לרשימה (גם מ"רענן" שב-⋮ — אחרי שהתפריט נסגר והחזיר את הפוקוס לכפתור שלו, ולא ל-body)
  const retryLoad = useCallback(() => {
    retry()
    requestAnimationFrame(() => document.getElementById(LIST_ID)?.focus({ preventScroll: true }))
  }, [retry])

  // ----- פעולות מרובות — רק על מה שמוצג ונבחר -----
  const selectedBooks = useMemo(() => books.filter((b) => selected.has(b.id)), [books, selected])
  const onBulk = useCallback((kind, value) => {
    if (selectedBooks.length === 0) return
    if (kind === 'merge') onDialog('merge', selectedBooks)
    else bulk(selectedBooks, kind, value)
  }, [selectedBooks, bulk, onDialog])

  const kind = ready ? emptyStateKind({ total: books.length, shown: filtered.length }) : null
  const openAdd = () => onDialog('add')

  return (
    <div className="flex flex-col gap-5">
      <BooksHeader
        tab="books"
        action={<Button variant="filled" size="sm" icon="add" onClick={openAdd}>הוסף ספר</Button>}
        menuItems={[
          { id: 'merge', icon: 'call_merge', label: 'מזג ספרים', onSelect: () => onDialog('merge', []) },
          { id: 'refresh', icon: 'refresh', label: 'רענן', onSelect: retryLoad },
        ]}
      />

      <BooksFilterBar
        query={query}
        onChange={changeQuery}
        onClear={clearAll}
        active={filtersActive}
        statusOptions={statusOptions}
        visibilityOptions={visibilityOptions}
        ownerOptions={ownerOptions}
        categoryOptions={categoryOptions}
      />

      <section
        id={LIST_ID}
        tabIndex={-1}
        aria-labelledby={BOOKS_TITLE_ID}
        aria-busy={loadState === 'loading' || undefined}
        className="flex flex-col gap-3 outline-none"
      >
        {loadState === 'loading' && (
          <>
            <p role="status" className="sr-only">טוען את הספרים…</p>
            <BooksListSkeleton />
          </>
        )}

        {loadState === 'error' && (error.sessionExpired ? (
          <ErrorState
            title="פג תוקף ההתחברות"
            description="התחבר מחדש כדי לראות את הספרים. אחרי ההתחברות תחזור לכאן."
            action={<Button href={loginHref('/library/admin/books')} variant="filled" size="sm" icon="login">התחבר</Button>}
          />
        ) : error.status === 403 ? (
          <ErrorState title="אין לך הרשאה לראות את הספרים" description="אם צריך גישה למסך הזה, פנה למנהל האתר." />
        ) : (
          <ErrorState title="לא הצלחנו לטעון את הספרים" description={error.message} onRetry={retryLoad} />
        ))}

        {ready && kind && <BooksEmptyState kind={kind} onClearFilters={clearAll} onAdd={openAdd} />}

        {ready && !kind && (
          <>
            <BooksBulkBar
              pageIds={pageIds}
              matchingIds={matchingIds}
              selected={selected}
              onSelect={select}
              onSelectAll={() => select(matchingIds, true)}
              onClear={clearSelection}
              clearedText={clearedText}
              total={filtered.length}
              sort={query.sort}
              onSortChange={(sort) => changeQuery({ sort })}
              categoryOptions={pickCategoryOptions}
              working={working}
              onBulk={onBulk}
              progress={bulkProgress}
              onStop={stopBulk}
            />

            <Card as="div" className="@container overflow-hidden">
              <ul ref={listRef} onFocus={onListFocus} aria-label="הספרים" className="divide-y divide-outline-variant/60">
                {page.items.map((book) => (
                  <BookRow
                    key={book.id}
                    book={book}
                    colorOf={colorOf}
                    selected={selected.has(book.id)}
                    onSelect={select}
                    onOpen={openDrawer}
                    actions={actions}
                    busy={pending.has(book.id)}
                  />
                ))}
              </ul>
            </Card>

            <ListPager page={page} onChange={goToPage} prefix="ספרים" />
          </>
        )}
      </section>

      {drawerBook && (
        <BookDrawer
          key={drawerBook.id}
          book={drawerBook}
          view={drawerView}
          onView={(view) => setQuery(updateBooksQuery(query, { view }))}
          onClose={closeDrawer}
          onDirtyChange={setDrawerDirty}
          colorOf={colorOf}
          actions={actions}
          busy={pending.has(drawerBook.id)}
          toast={toast}
          confirm={confirm}
          returnFocus={drawerReturnFocus}
        />
      )}

      {dialog?.kind === 'add' && (
        <AddBookDialog
          categoryOptions={pickCategoryOptions}
          onAdded={(name) => { toast.show({ message: <><QuotedName name={name} /> נוסף</> }); refresh() }}
          onClose={closeDialog}
        />
      )}
      {(dialog?.kind === 'rename' || dialog?.kind === 'category') && (
        <RenameBookDialog
          book={dialog.payload}
          mode={dialog.kind === 'category' ? 'category' : 'name'}
          categoryOptions={pickCategoryOptions}
          onSave={saveDetails}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'show' && (
        <ShowBookDialog
          book={dialog.payload}
          subscriberCount={subscriberCount}
          onConfirm={(book, sendNotification) => setHidden(book, false, { sendNotification })}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'merge' && (
        <MergeBooksDialog
          initial={dialog.payload}
          books={books}
          onMerged={(name, warning) => {
            toast.show(warning
              ? { tone: 'error', message: <>הספרים מוזגו ל<QuotedName name={name} />, אבל {warning}</> }
              : { message: <>הספרים מוזגו ל<QuotedName name={name} /></> })
            clearSelection()
            if (query.book) setQuery(updateBooksQuery(query, { book: '' }))
            refresh()
          }}
          onClose={closeDialog}
        />
      )}

      {confirmElement}
    </div>
  )
}
