'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import { canManageLibrarySync } from '@/lib/roles'
import DiffPreview from '@/components/library/DiffPreview'

// טוען את ה-diff של ספר בודד רק כשפותחים אותו (לחיצה), כדי שעמוד הרשימה לא יריץ
// diff על כל הספרים — לא בבקשה אחת ולא ב-N בקשות מקבילות עם הרינדור.
function ConflictDiff({ bookId, onResolved }) {
  const { showAlert } = useDialog()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ loading: false, changes: null, changeCount: 0, error: false, loaded: false })
  const queueRef = useRef([])      // תור הכרעות ממתינות {change, strategy}
  const drainingRef = useRef(false) // האם מעבד התור פעיל (סריאלי)
  const pendingRef = useRef(new Set()) // מקטעים שכבר נכנסו לתור — מניעת הכנסה כפולה/סותרת
  const latestRef = useRef({ changes: null, changeCount: 0 }) // מראה ל-state עבור drain
  latestRef.current = { changes: state.changes, changeCount: state.changeCount }

  const loadDiff = useCallback(() => {
    pendingRef.current = new Set() // נתונים טריים → אובייקטי-מקטע חדשים
    setState((s) => ({ ...s, loading: true, error: false }))
    return fetch(`/api/library/books/${bookId}/conflict-diff`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((data) => { setState({ loading: false, changes: data.changes, changeCount: data.changeCount, error: false, loaded: true }); return data })
      .catch(() => { setState({ loading: false, changes: null, changeCount: 0, error: true, loaded: false }); return null })
  }, [bookId])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && !state.loaded && !state.loading) loadDiff()
  }

  // מעבד התור סריאלית: בקשה אחת בכל רגע לאותו ספר, כדי שכתיבות לא ידרסו זו את זו.
  // הזיהוי לשרת לפי תוכן (fullBefore/fullAfter), לכן הסדר/הסטות אינדקס לא משנים.
  const drain = useCallback(async () => {
    if (drainingRef.current) return
    drainingRef.current = true
    let lastData = null
    try {
      while (queueRef.current.length) {
        const { change, strategy } = queueRef.current.shift()
        try {
          const res = await fetch(`/api/library/books/${bookId}/resolve-conflict-hunk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ before: change.fullBefore, after: change.fullAfter, strategy }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'שגיאה')
          lastData = data
          onResolved?.(bookId, data) // עדכון מונה בהורה / הסרת הכרטיס כשנפתר
        } catch (e) {
          // כשל — מבטלים את התור, מסנכרנים מחדש (מחזיר מקטעים שהוסרו אופטימית) ועוצרים
          queueRef.current = []
          const data = await loadDiff()
          if (data) onResolved?.(bookId, { resolved: false, conflictCount: data.changeCount })
          showAlert('שגיאה', e.message)
          return // ה-finally יאפס drainingRef; דילוג על טעינת המנה הבאה
        }
      }
      // מנה הבאה: אם הוכרעו כל המקטעים המוצגים אך נותרו עוד בשרת (יותר מ-30 מקטעים)
      // — טוענים מנה נוספת, אחרת התצוגה תיתקע על "אין תצוגה מקדימה".
      const { changes } = latestRef.current
      if (lastData && !lastData.resolved && (!changes || changes.length === 0)) {
        await loadDiff()
      }
    } finally {
      drainingRef.current = false
    }
  }, [bookId, onResolved, loadDiff, showAlert])

  // הכרעת מקטע בודד: הסרה אופטימית מיידית (התצוגה מתעדכנת בלי להמתין לשרת, אפשר
  // ללחוץ על הבא מיד), והבקשה בפועל נכנסת לתור שמעובד סריאלית.
  const resolveHunk = useCallback((change, strategy) => {
    // מניעת הכנסה כפולה/סותרת של אותו מקטע (למשל לחיצה מהירה על "גיטהאב" ואז "האתר"
    // לפני רינדור) — הלחיצה השנייה על אותו מקטע מתעלמים ממנה.
    if (pendingRef.current.has(change)) return
    pendingRef.current.add(change)
    setState((s) => ({
      ...s,
      changes: (s.changes || []).filter((c) => c !== change),
      changeCount: Math.max(0, s.changeCount - 1),
    }))
    queueRef.current.push({ change, strategy })
    drain()
  }, [drain])

  return (
    <div>
      <button onClick={toggle} className="text-sm font-semibold text-slate-600 hover:text-primary flex items-center gap-1">
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>‹</span>
        {open ? 'הסתר הבדלים' : 'הצג והכרע את ההבדלים בין הגרסאות'}
      </button>
      {open && (
        <div className="mt-2">
          <div className="flex items-center gap-3 text-xs text-slate-500 mb-2 flex-wrap">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-200 border border-red-300" /> גיטהאב</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-300" /> האתר</span>
            <span className="text-slate-400">לחצו "קבל גרסה זו" ליד כל גרסה כדי להכריע מקטע בודד</span>
          </div>
          {state.loading ? (
            <div className="h-12 bg-slate-50 animate-pulse rounded-lg" />
          ) : state.error ? (
            <div className="text-sm text-slate-400">שגיאה בטעינת ההבדלים</div>
          ) : (
            <DiffPreview changes={state.changes} total={state.changeCount} onResolve={resolveHunk} />
          )}
        </div>
      )}
    </div>
  )
}

export default function ConflictsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
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

  // עדכון מקומי לאחר הכרעת מקטע בודד — בלי משיכה מחדש של כל הרשימה.
  // נפתר → הספר יורד מהרשימה; אחרת → מעדכנים את מונה המקטעים שנותרו.
  // memoized כדי לא לשבור את ה-memo של DiffPreview דרך שרשרת ה-callbacks.
  const handleHunkResolved = useCallback((bookId, result) => {
    setConflicts((list) =>
      result.resolved
        ? list.filter((c) => c._id !== bookId)
        : list.map((c) => (c._id === bookId ? { ...c, conflictCount: result.conflictCount } : c))
    )
  }, [])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(pathname)}`)
      return
    }
    fetchConflicts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            קונפליקט קורה כשגם באתר וגם בגיטהאב שונה אותו קטע מאז הסנכרון האחרון. אפשר להכריע מקטע-מקטע ("הצג והכרע את ההבדלים" ולחיצה על "קבל גרסה זו" ליד הגרסה הרצויה), להכריע את כל הספר בכפתורים למטה, או לפתוח בעורך למיזוג ידני. כשכל המקטעים יוכרעו — הקונפליקט ייסגר אוטומטית.
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
                  <div className="mb-4">
                    <ConflictDiff bookId={c._id} onResolved={handleHunkResolved} />
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
