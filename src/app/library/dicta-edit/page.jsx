'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import { canModerateLibrary, canManageLibrarySync } from '@/lib/roles'

function LibraryEditSpaceContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { showAlert } = useDialog()

  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  // אתחול שדה החיפוש משם הספר שנשלח ב-URL (פרמטר q), למשל מאוצריא
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '')
  // קטע למיקוד שהגיע מקישור עמוק שנפל לרשימה (עמימות בשם) — מועבר הלאה לעורך
  const findParam = searchParams.get('find') || ''
  const [filterCategory, setFilterCategory] = useState('all')
  const [syncing, setSyncing] = useState(false)
  const [pushing, setPushing] = useState(false)

  const user = session?.user
  const isModerator = canModerateLibrary(user)
  const canSync = canManageLibrarySync(user)

  const fetchBooks = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/library/books')
      if (res.ok) setBooks(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      // שימור ה-query (למשל ?q=שם הספר) כדי שלא יאבד לאחר ההתחברות
      const query = searchParams.toString()
      const callbackUrl = query ? `${pathname}?${query}` : pathname
      router.push(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
      return
    }
    fetchBooks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const handleSync = async () => {
    try {
      setSyncing(true)
      const res = await fetch('/api/library/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה בסנכרון')
      showAlert('סנכרון הושלם', `סה"כ ${data.total} | נוספו ${data.added} | עודכנו ${data.fastForwarded} | מסונכרנים ${data.unchanged} | בהמתנה למיזוג ${data.diverged}`)
      fetchBooks()
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setSyncing(false)
    }
  }

  const handlePush = async () => {
    try {
      setPushing(true)
      const res = await fetch('/api/library/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'NO_TOKEN') throw new Error('חסר טוקן GitHub בהגדרות השרת (DICTA_LIBRARY_GITHUB_TOKEN).')
        throw new Error(data.error || 'שגיאה בדחיפה')
      }
      showAlert('דחיפה הושלמה', `נדחפו ${data.pushed} ספרים ב-${data.commits || 0} commits · מוזגו ${data.mergedClean} · עדכניים ${data.upToDate} · קונפליקטים ${data.conflicts} · שגיאות ${data.errors}`)
      fetchBooks()
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setPushing(false)
    }
  }

  const conflictCount = useMemo(() => books.filter((b) => b.syncStatus === 'conflict').length, [books])

  const categories = useMemo(
    () => [...new Set(books.map((b) => b.category).filter(Boolean))].sort(),
    [books]
  )

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return books.filter((b) => {
      const matchesSearch = b.title?.toLowerCase().includes(q)
      const matchesCat = filterCategory === 'all' || b.category === filterCategory
      return matchesSearch && matchesCat
    })
  }, [books, searchTerm, filterCategory])

  const displayName = (b) => (b.title?.split('/').slice(1).join('/').trim() || b.title)

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-4xl font-bold font-frank text-neutral-cool-900 mb-2">מרחב תיקון ספרים</h1>
              <p className="text-neutral-cool-600 text-lg">
                {loading ? 'טוען...' : `${filtered.length} ספרים`} · תיקון שיבושים בספרי דיקטה הערוכים
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:justify-end">
              {isModerator && (
                <Link href="/library/dicta-edit/moderation" className="inline-flex items-center gap-2 bg-white border border-neutral-cool-200 text-neutral-cool-700 px-5 py-2.5 rounded-xl hover:bg-neutral-cool-50 font-semibold shadow-sm">
                  <span className="material-symbols-outlined text-primary">rule</span>
                  תור אישורים
                </Link>
              )}
              {canSync && conflictCount > 0 && (
                <Link href="/library/dicta-edit/conflicts" className="inline-flex items-center gap-2 bg-danger-50 border border-danger-200 text-danger-700 px-5 py-2.5 rounded-xl hover:bg-danger-100 font-semibold shadow-sm">
                  <span className="material-symbols-outlined">sync_problem</span>
                  {conflictCount} קונפליקטים
                </Link>
              )}
              {canSync && (
                <button onClick={handleSync} disabled={syncing} className="inline-flex items-center gap-2 bg-white border border-neutral-cool-200 text-neutral-cool-700 px-5 py-2.5 rounded-xl hover:bg-neutral-cool-50 font-semibold shadow-sm disabled:opacity-50">
                  <span className="material-symbols-outlined text-primary">cloud_sync</span>
                  {syncing ? 'מסנכרן...' : 'משוך מגיטהאב'}
                </button>
              )}
              {canSync && (
                <button onClick={handlePush} disabled={pushing} className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl hover:bg-primary/90 font-semibold shadow-sm disabled:opacity-50">
                  <span className="material-symbols-outlined">cloud_upload</span>
                  {pushing ? 'דוחף...' : 'כפה סנכרון לגיטהאב'}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-neutral-cool-400">search</span>
              <input
                type="text"
                placeholder="חיפוש ספר לפי שם..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-neutral-cool-200 rounded-2xl py-3 pr-12 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-sm text-lg"
              />
            </div>
            <div className="min-w-[200px]">
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full h-full px-4 py-3 rounded-2xl border border-neutral-cool-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm text-lg cursor-pointer">
                <option value="all">כל הקטגוריות</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-white animate-pulse rounded-2xl border border-neutral-cool-100" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-neutral-cool-300">
              <p className="text-neutral-cool-400 text-lg mb-2">אין ספרים במרחב עדיין.</p>
              {canSync && <p className="text-neutral-cool-400 text-sm">לחצו על כפתור הסנכרון למעלה כדי לייבא את הספרים הערוכים.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((book) => (
                <Link key={book._id} href={`/library/dicta-edit/${book._id}${findParam ? `?find=${encodeURIComponent(findParam)}` : ''}`}
                  className="group bg-white rounded-2xl border border-neutral-cool-200 p-6 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5 transition-all flex flex-col">
                  <div className="flex justify-between items-start mb-3">
                    {book.category && (
                      <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-lg bg-neutral-cool-100 text-neutral-cool-600 border border-neutral-cool-200">{book.category}</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      {book.pendingCount > 0 && (
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-warning-50 text-warning-600 border border-warning-100" title="הצעות ממתינות">
                          {book.pendingCount} ממתינות
                        </span>
                      )}
                      {book.syncStatus === 'dirty' && <span className="material-symbols-outlined text-success-alt-400 text-lg" title="יש שינויים שטרם נדחפו לגיטהאב">cloud_upload</span>}
                      {book.syncStatus === 'conflict' && <span className="material-symbols-outlined text-danger-400 text-lg" title="קונפליקט סנכרון">sync_problem</span>}
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-neutral-cool-800 font-frank leading-tight line-clamp-2" title={book.title}>
                    {displayName(book)}
                  </h3>
                  <div className="mt-auto pt-4 flex items-center gap-2 text-sm text-primary font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-base">edit</span>
                    פתח לתיקון
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// עטיפת Suspense — נדרשת ל-useSearchParams ב-Next.js כדי למנוע שגיאת build
export default function LibraryEditSpacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#f8f9fa]" />}>
      <LibraryEditSpaceContent />
    </Suspense>
  )
}
