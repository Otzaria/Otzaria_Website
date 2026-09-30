'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { useRequireAuth } from '@/hooks/useRequireAuth'
import BookAliasesCard from '@/components/acronyms/BookAliasesCard'
import BulkReplacePanel from '@/components/acronyms/BulkReplacePanel'
import NewBookForm from '@/components/acronyms/NewBookForm'
import ChangeBasketBar from '@/components/acronyms/ChangeBasketBar'
import { addToBasket, basketOps, filterBooks, removeFromBasket } from '@/lib/acronyms/basket'

const BASKET_KEY = 'acronyms-basket-v1'
const PAGE_SIZE = 30

function readStoredBasket() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BASKET_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function storeBasket(basket) {
  try {
    localStorage.setItem(BASKET_KEY, JSON.stringify(basket))
  } catch {
    // אחסון חסום (חלון פרטי) — הסל נשמר רק בזיכרון
  }
}

export default function LibraryAcronymsPage() {
  const { status } = useRequireAuth()
  const { showAlert } = useDialog()
  const [books, setBooks] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [basket, setBasket] = useState([])
  const [newTitles, setNewTitles] = useState([])
  const [panel, setPanel] = useState(null) // 'replace' | 'new-book' | null
  const [submitting, setSubmitting] = useState(false)
  const [lastPr, setLastPr] = useState(null)

  useEffect(() => setBasket(readStoredBasket()), [])

  const updateBasket = useCallback((next) => {
    setBasket(next)
    storeBasket(next)
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/library/book-acronyms', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בטעינת הכינויים')
      setBooks(data.books || [])
      setPending(data.pending || [])
    } catch (loadError) {
      showAlert('שגיאה', loadError.message)
    } finally {
      setLoading(false)
    }
  }, [showAlert])

  useEffect(() => {
    if (status === 'authenticated') loadData()
  }, [status, loadData])

  // ספרים חדשים: שנוצרו כאן, או שכבר יש להם שינוי בסל שנשמר
  const allBooks = useMemo(() => {
    const known = new Set(books.map((b) => b.title))
    const extra = [...new Set([...newTitles, ...basket.filter((o) => o.newBook).map((o) => o.book)])].filter((t) => !known.has(t))
    return [...extra.map((title) => ({ title, aliases: [], isNew: true })), ...books]
  }, [books, newTitles, basket])

  const pendingByBook = useMemo(() => {
    const map = new Map()
    for (const cs of pending) {
      for (const op of cs.ops || []) {
        const list = map.get(op.book) || []
        list.push({ op, prNumber: cs.prNumber, prUrl: cs.prUrl })
        map.set(op.book, list)
      }
    }
    return map
  }, [pending])

  const filtered = useMemo(() => filterBooks(allBooks, search), [allBooks, search])

  const addOp = (op) => updateBasket(addToBasket(basket, op))
  const onError = (message) => showAlert('לא ניתן להוסיף לסל', message)

  const addReplacements = (items) => {
    let next = basket
    for (const item of items) next = addToBasket(next, { type: 'rename', book: item.book, from: item.from, to: item.to })
    updateBasket(next)
    setPanel(null)
  }

  const submit = async () => {
    try {
      setSubmitting(true)
      const response = await fetch('/api/library/book-acronyms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: basketOps(basket) }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'שגיאה בשליחה')
      updateBasket([])
      setNewTitles([])
      setLastPr({ url: data.prUrl, number: data.prNumber })
      await loadData()
    } catch (submitError) {
      showAlert('השליחה נכשלה', submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-on-surface">כינויים וראשי תיבות לספרים</h1>
              <p className="text-on-surface/70 mt-1">הכינויים משמשים את תוכנת אוצריא לאיתור ספרים לפי שם מקוצר או ראשי תיבות.</p>
              <p className="text-on-surface/70 mt-1">
                השינויים נאספים בסל. בשליחה נפתחת בקשת שינוי אחת בפורק הכינויים של אוצריא, והיא נכנסת לתוכנה אחרי בדיקה ומיזוג.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setVisible(PAGE_SIZE) }}
                placeholder="חיפוש לפי שם ספר או כינוי"
                className="w-full md:w-80 border rounded-lg px-4 py-2 bg-white"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setPanel(panel === 'replace' ? null : 'replace')} className="px-3 py-1.5 rounded-lg border border-primary text-primary flex items-center gap-1 text-sm">
                  <span className="material-symbols-outlined text-base">find_replace</span>
                  החלפה בכל הכינויים
                </button>
                <button type="button" onClick={() => setPanel(panel === 'new-book' ? null : 'new-book')} className="px-3 py-1.5 rounded-lg border border-primary text-primary flex items-center gap-1 text-sm">
                  <span className="material-symbols-outlined text-base">add</span>
                  ספר שאינו ברשימה
                </button>
              </div>
            </div>
          </div>

          {lastPr && (
            <div className="mb-4 rounded-xl border border-success-200 bg-success-50 text-success-800 p-4 flex items-center justify-between gap-2">
              <span>תודה! השינויים נשלחו לבדיקה.</span>
              <a href={lastPr.url} target="_blank" rel="noreferrer" className="underline flex items-center gap-1">
                בקשה #{lastPr.number}
                <span className="material-symbols-outlined text-base">open_in_new</span>
              </a>
            </div>
          )}

          {panel === 'replace' && <BulkReplacePanel books={books} onAdd={addReplacements} onClose={() => setPanel(null)} />}
          {panel === 'new-book' && (
            <NewBookForm
              onClose={() => setPanel(null)}
              onCreate={(title) => {
                setNewTitles((prev) => (prev.includes(title) ? prev : [title, ...prev]))
                setSearch(title)
                setPanel(null)
              }}
            />
          )}

          {loading ? (
            <LoadingSpinner message="טוען כינויים..." />
          ) : (
            <>
              <div className="text-sm text-on-surface/60 mb-2">{filtered.length} ספרים</div>
              <div className="space-y-4">
                {filtered.slice(0, visible).map((book) => (
                  <BookAliasesCard key={book.title} book={book} basket={basket} pending={pendingByBook.get(book.title) || []} onOp={addOp} onError={onError} />
                ))}
              </div>
              {filtered.length > visible && (
                <div className="mt-4 flex justify-center">
                  <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="px-4 py-2 rounded-lg border border-neutral-300">
                    הצגת עוד ספרים
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <ChangeBasketBar basket={basket} submitting={submitting} onRemove={(i) => updateBasket(removeFromBasket(basket, i))} onClear={() => updateBasket([])} onSubmit={submit} />
    </div>
  )
}
