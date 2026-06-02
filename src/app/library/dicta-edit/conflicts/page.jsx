'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import { canManageLibrarySync } from '@/lib/roles'

export default function ConflictsPage() {
  const { data: session, status } = useSession()
  const { showAlert, showConfirm } = useDialog()
  const [conflicts, setConflicts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const canSync = canManageLibrarySync(session?.user)

  const fetchConflicts = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/library/conflicts')
      if (res.ok) setConflicts(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'authenticated') fetchConflicts()
  }, [status])

  const resolve = (book, strategy) => {
    const label = strategy === 'ours' ? 'גרסת האתר (תדרוס את גיטהאב בדחיפה הבאה)' : 'גרסת גיטהאב (עריכות האתר לספר זה יבוטלו)'
    showConfirm('פתרון קונפליקט', `לפתור את "${book.title}" לטובת ${label}?`, async () => {
      setBusy(true)
      try {
        const res = await fetch(`/api/library/books/${book._id}/resolve-conflict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategy }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'שגיאה')
        await fetchConflicts()
      } catch (e) {
        showAlert('שגיאה', e.message)
      } finally {
        setBusy(false)
      }
    })
  }

  const bookName = (path) => (path?.split('/').slice(1).join('/').replace(/\.txt$/, '') || path)

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>
  }
  if (!canSync) {
    return <div className="min-h-screen bg-[#f8f9fa]"><Header /><div className="container mx-auto px-4 py-20 text-center text-slate-500">אין לך הרשאת גישה.</div></div>
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <Header />
      <main className="container mx-auto px-4 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold font-frank text-slate-900">קונפליקטים בסנכרון</h1>
              <p className="text-slate-600">{loading ? 'טוען...' : `${conflicts.length} ספרים דורשים הכרעה`}</p>
            </div>
            <Link href="/library/dicta-edit" className="text-primary font-semibold hover:underline">→ חזרה למרחב</Link>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6 text-sm text-amber-800">
            קונפליקט קורה כשגם באתר וגם בגיטהאב שונה אותו קטע מאז הסנכרון האחרון. בחרו איזו גרסה גוברת, או פתחו בעורך למיזוג ידני — ולאחר עריכה ושמירה הכריעו לטובת גרסת האתר.
          </div>

          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-white animate-pulse rounded-2xl border border-slate-100" />)}</div>
          ) : conflicts.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400">אין קונפליקטים פתוחים 🎉</div>
          ) : (
            <div className="space-y-3">
              {conflicts.map((c) => (
                <div key={c._id} className="bg-white rounded-2xl border border-red-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                    <div>
                      <span className="font-bold text-slate-800 font-frank text-lg">{bookName(c.path)}</span>
                      {c.category && <span className="text-xs text-slate-400 mr-2">{c.category}</span>}
                      <span className="text-xs text-red-500 mr-2">{c.conflictCount} מקטעים מתנגשים</span>
                    </div>
                    <Link href={`/library/dicta-edit/${c._id}`} className="text-sm text-primary font-semibold hover:underline">פתח בעורך »</Link>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => resolve(c, 'ours')} disabled={busy} className="bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-400 disabled:opacity-50">
                      השתמש בגרסת האתר
                    </button>
                    <button onClick={() => resolve(c, 'theirs')} disabled={busy} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 disabled:opacity-50">
                      השתמש בגרסת גיטהאב
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
