'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import LabelChips from '@/components/corrections/LabelChips'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { HANDOFF_REASON_LABELS } from '@/lib/corrections/states'

const VIEWS = [
  { id: 'queued', label: 'ממתינים לטיפול' },
  { id: 'mine', label: 'בטיפולי' },
  { id: 'claimed', label: 'בטיפול מתנדבים' },
  { id: 'auto', label: 'בבדיקה אוטומטית' },
  { id: 'publishing', label: 'אושרו / בפרסום' },
  { id: 'closed', label: 'סגורים' },
  { id: 'all', label: 'הכל' },
]

// תקרת השרת ל-limit היא 100.
const PAGE_SIZE = 50
const FILTERS_KEY = 'corrections:listFilters'

const STATE_LABELS = {
  open: 'פתוח',
  email_only: 'מייל בלבד (לא לאוצריא)',
  closed_published: 'פורסם',
  closed_already_fixed: 'כבר תוקן',
  closed_rejected: 'נדחה',
  closed_manual: 'נסגר ידנית',
}

export default function CorrectionsListPage() {
  const [view, setView] = useState('queued')
  const [kind, setKind] = useState('')
  const [source, setSource] = useState('')
  const [reason, setReason] = useState('')
  const [assignee, setAssignee] = useState('')
  const [handlers, setHandlers] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [ready, setReady] = useState(false)
  const sentinel = useRef(null)

  // הסינון נשמר ב-sessionStorage כדי ש"חזרה לתור" מדף דיווח לא תאפס אותו.
  useEffect(() => {
    try {
      const f = JSON.parse(sessionStorage.getItem(FILTERS_KEY) || 'null')
      if (f) {
        if (VIEWS.some((v) => v.id === f.view)) setView(f.view)
        setKind(f.kind || '')
        setSource(f.source || '')
        setReason(f.reason || '')
        setAssignee(f.assignee || '')
      }
    } catch { /* אחסון חסום — ברירות מחדל */ }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ view, kind, source, reason, assignee }))
    } catch { /* אחסון חסום */ }
  }, [ready, view, kind, source, reason, assignee])

  const fetchPage = useCallback(async (skip) => {
    const q = new URLSearchParams({ view, limit: String(PAGE_SIZE), skip: String(skip) })
    if (kind) q.set('kind', kind)
    if (source.trim()) q.set('source', source.trim())
    if (reason) q.set('reason', reason)
    if (assignee) q.set('assignee', assignee)
    const res = await fetch(`/api/corrections/reports?${q}`, { cache: 'no-store' })
    const body = await res.json()
    if (!res.ok) throw new Error(res.status === 403 ? 'אין לך הרשאה לטפל בתיקוני טקסט' : body.error || 'שגיאה בטעינה')
    return body
  }, [view, kind, source, reason, assignee])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchPage(0))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [fetchPage])

  const hasMore = Boolean(data && data.items.length < data.total)

  const loadMore = useCallback(async () => {
    if (!data || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const body = await fetchPage(data.items.length)
      // דיווח שנסגר בינתיים מזיז את ההיסט — מסננים כפילויות לפי מזהה.
      setData((prev) => {
        const seen = new Set(prev.items.map((r) => r.id))
        return { ...body, items: [...prev.items, ...body.items.filter((r) => !seen.has(r.id))] }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }, [data, loadingMore, hasMore, fetchPage])

  useEffect(() => { if (ready) load() }, [ready, load])

  // טעינה אוטומטית כשמגיעים לתחתית הרשימה.
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore() }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loadMore])
  useEffect(() => {
    fetch('/api/corrections/handlers').then((r) => (r.ok ? r.json() : null)).then((b) => b && setHandlers(b.users)).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === v.id ? 'bg-primary text-on-primary' : 'glass hover:bg-surface-variant'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-end glass rounded-xl p-3">
        <label className="text-sm">
          סוג
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1 bg-white">
            <option value="">הכל</option>
            <option value="text_correction">הצעת תיקון</option>
            <option value="free_text">דיווח חופשי</option>
          </select>
        </label>
        <label className="text-sm">
          תיקיית מקור
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="למשל ToratEmetToOtzaria" className="block mt-1 border rounded-lg px-2 py-1 bg-white" dir="ltr" />
        </label>
        <label className="text-sm">
          סיבת העברה לידני
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1 bg-white">
            <option value="">הכל</option>
            {Object.entries(HANDOFF_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-sm">
          מטפל
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="block mt-1 border rounded-lg px-2 py-1 bg-white">
            <option value="">הכל</option>
            {handlers.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </label>
        <button onClick={load} className="px-3 py-1.5 rounded-lg glass hover:bg-surface-variant flex items-center gap-1">
          <span className="material-symbols-outlined text-base">refresh</span> רענון
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && <div className="bg-danger-50 text-danger-700 border border-danger-200 rounded-lg p-3">{error}</div>}
      {!loading && data && (
        <>
          <p className="text-sm text-on-surface/60">{data.total} דיווחים</p>
          <div className="space-y-2">
            {data.items.map((r) => (
              <Link key={r.id} href={`/library/corrections/${r.id}`} className="block glass rounded-xl p-4 hover:bg-surface-variant transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-on-surface truncate">{r.bookTitle} <span className="font-normal text-on-surface/60">— {r.currentRef}</span></div>
                    <div className="text-xs text-on-surface/60 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{r.kind === 'text_correction' ? 'הצעת תיקון' : 'דיווח חופשי'}</span>
                      <span dir="ltr">{r.sourceFolder}</span>
                      <span>{STATE_LABELS[r.state] || r.state}</span>
                      {r.manual.handoffReason && <span>סיבה: {HANDOFF_REASON_LABELS[r.manual.handoffReason] || r.manual.handoffReason}</span>}
                      {r.manual.status === 'claimed' && <span>מטפל: {r.manual.assigneeName}</span>}
                      <span>{new Date(r.createdAt).toLocaleString('he-IL')}</span>
                    </div>
                  </div>
                  <LabelChips labels={r.labels} />
                </div>
              </Link>
            ))}
            {!data.items.length && <div className="text-center text-on-surface/60 py-10">אין דיווחים בתצוגה זו</div>}
          </div>
          {hasMore && (
            <div ref={sentinel} className="flex justify-center py-4">
              {loadingMore ? <LoadingSpinner /> : (
                <button onClick={loadMore} className="px-4 py-2 rounded-lg glass hover:bg-surface-variant text-sm">
                  טען עוד ({data.items.length} מתוך {data.total})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
