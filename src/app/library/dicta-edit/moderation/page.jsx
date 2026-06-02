'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import { canModerateLibrary } from '@/lib/roles'
import { EDIT_TYPE_LABELS, EDIT_KIND } from '@/lib/dicta/edit-constants'

export default function ModerationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()

  const [edits, setEdits] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [filterBook, setFilterBook] = useState('')
  const [filterKind, setFilterKind] = useState('all')
  const [blockTarget, setBlockTarget] = useState(null)

  const isModerator = canModerateLibrary(session?.user)

  const fetchEdits = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/library/edits?status=pending')
      if (res.ok) {
        setEdits(await res.json())
        setSelected(new Set())
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`)
      return
    }
    fetchEdits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const bookName = (path) => (path?.split('/').slice(1).join('/').replace(/\.txt$/, '') || path)

  const filtered = useMemo(() => {
    return edits.filter((e) => {
      const matchBook = !filterBook || e.bookPath?.toLowerCase().includes(filterBook.toLowerCase())
      const matchKind = filterKind === 'all' || e.kind === filterKind
      return matchBook && matchKind
    })
  }, [edits, filterBook, filterKind])

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const act = async (id, action, note) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/library/edits/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה')
      if (data.status === 'conflict') {
        showAlert('קונפליקט', 'הטקסט המקורי השתנה מאז הגשת ההצעה, ולכן לא ניתן להחילה אוטומטית. ניתן לדחות אותה ולבקש הגשה מחדש.')
      } else {
        await fetchEdits()
      }
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  const bulk = async (action) => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/library/edits/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה')
      showAlert('בוצע', `אושרו ${data.approved || 0} · נדחו ${data.rejected || 0} · קונפליקטים ${data.conflicts || 0} · דולגו ${data.skipped || 0}`)
      await fetchEdits()
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  const approveAllMatchingPattern = (fr) => {
    showConfirm(
      'אישור כל ההחלפות הזהות',
      `לאשר את כל ההצעות הממתינות של ההחלפה "${fr.find}" ← "${fr.replace}" בכל הספרים?`,
      async () => {
        setBusy(true)
        try {
          const res = await fetch('/api/library/edits/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'approve', patternFilter: { find: fr.find, replace: fr.replace } }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'שגיאה')
          showAlert('בוצע', `אושרו ${data.approved || 0} · קונפליקטים ${data.conflicts || 0}`)
          await fetchEdits()
        } catch (e) {
          showAlert('שגיאה', e.message)
        } finally {
          setBusy(false)
        }
      }
    )
  }

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div>
  }
  if (!isModerator) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]"><Header />
        <div className="container mx-auto px-4 py-20 text-center text-slate-500">אין לך הרשאת גישה לתור האישורים.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <Header />
      <main className="container mx-auto px-4 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold font-frank text-slate-900">תור אישורים</h1>
              <p className="text-slate-600">{loading ? 'טוען...' : `${filtered.length} הצעות ממתינות`}</p>
            </div>
            <Link href="/library/dicta-edit" className="text-primary font-semibold hover:underline">→ חזרה למרחב</Link>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <input value={filterBook} onChange={(e) => setFilterBook(e.target.value)} placeholder="סינון לפי ספר..."
              className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm" />
            <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
              <option value="all">כל הסוגים</option>
              <option value={EDIT_KIND.MANUAL}>עריכה ידנית</option>
              <option value={EDIT_KIND.FIND_REPLACE}>חיפוש והחלפה</option>
            </select>
          </div>

          {selected.size > 0 && (
            <div className="sticky top-2 z-10 flex items-center gap-3 bg-slate-900 text-white rounded-xl px-4 py-3 mb-4 shadow-lg">
              <span className="font-semibold">{selected.size} נבחרו</span>
              <button disabled={busy} onClick={() => bulk('approve')} className="bg-emerald-500 px-4 py-1.5 rounded-lg font-bold hover:bg-emerald-400 disabled:opacity-50">אשר נבחרים</button>
              <button disabled={busy} onClick={() => bulk('reject')} className="bg-red-500 px-4 py-1.5 rounded-lg font-bold hover:bg-red-400 disabled:opacity-50">דחה נבחרים</button>
              <button onClick={() => setSelected(new Set())} className="mr-auto text-slate-300 hover:text-white">בטל בחירה</button>
            </div>
          )}

          {loading ? (
            <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-white animate-pulse rounded-2xl border border-slate-100" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400">אין הצעות ממתינות 🎉</div>
          ) : (
            <div className="space-y-4">
              {filtered.map((e) => (
                <EditCard
                  key={e._id}
                  edit={e}
                  bookName={bookName(e.bookPath)}
                  selected={selected.has(e._id)}
                  onToggle={() => toggleSelect(e._id)}
                  busy={busy}
                  onApprove={() => act(e._id, 'approve')}
                  onReject={() => act(e._id, 'reject')}
                  onApprovePattern={() => approveAllMatchingPattern(e.findReplace)}
                  onBlock={() => setBlockTarget({ id: e.author, name: e.authorName })}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {blockTarget && (
        <BlockUserModal
          target={blockTarget}
          onClose={() => setBlockTarget(null)}
          onDone={() => { setBlockTarget(null); fetchEdits() }}
        />
      )}
    </div>
  )
}

function EditCard({ edit, bookName, selected, onToggle, busy, onApprove, onReject, onApprovePattern, onBlock }) {
  const isFR = edit.kind === EDIT_KIND.FIND_REPLACE
  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3 mb-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1.5 w-4 h-4" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800 font-frank text-lg">{bookName}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isFR ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
              {isFR ? 'חיפוש והחלפה' : 'עריכה ידנית'}
            </span>
            {edit.editType && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{EDIT_TYPE_LABELS[edit.editType] || edit.editType}</span>}
            <span className="text-xs text-slate-400">{edit.changeCount} מקטעים</span>
          </div>
          <div className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>מאת <button onClick={onBlock} className="font-semibold text-slate-700 hover:text-red-600 underline decoration-dotted" title="ניהול / חסימת משתמש">{edit.authorName}</button></span>
            {edit.note && <span className="text-slate-600">· {edit.note}</span>}
          </div>
        </div>
      </div>

      {isFR && edit.findReplace && (
        <div className="mb-3 text-sm bg-purple-50 border border-purple-100 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
          <code className="font-mono bg-white px-2 py-0.5 rounded border">{edit.findReplace.find}</code>
          <span>←</span>
          <code className="font-mono bg-white px-2 py-0.5 rounded border">{edit.findReplace.replace || '(ריק)'}</code>
          {edit.findReplace.isRegex && <span className="text-xs text-purple-500">regex</span>}
          <button onClick={onApprovePattern} disabled={busy} className="mr-auto text-xs font-bold text-purple-700 hover:underline disabled:opacity-50">אשר את כל ההחלפות הזהות »</button>
        </div>
      )}

      <DiffPreview changes={edit.changes} total={edit.changeCount} />

      <div className="flex gap-2 mt-4">
        <button onClick={onApprove} disabled={busy} className="flex items-center gap-1.5 bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-400 disabled:opacity-50">
          <span className="material-symbols-outlined text-base">check</span> אשר
        </button>
        <button onClick={onReject} disabled={busy} className="flex items-center gap-1.5 bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-50 disabled:opacity-50">
          <span className="material-symbols-outlined text-base">close</span> דחה
        </button>
      </div>
    </div>
  )
}

function DiffPreview({ changes, total }) {
  if (!changes?.length) return <div className="text-sm text-slate-400">אין תצוגה מקדימה</div>
  return (
    <div className="space-y-2 font-mono text-sm" dir="rtl">
      {changes.map((c, i) => (
        <div key={i} className="rounded-lg overflow-hidden border border-slate-200">
          {c.before !== '' && (
            <div className="bg-red-50 text-red-800 px-3 py-1 whitespace-pre-wrap break-words border-r-4 border-red-300">{c.before}</div>
          )}
          {c.after !== '' && (
            <div className="bg-emerald-50 text-emerald-800 px-3 py-1 whitespace-pre-wrap break-words border-r-4 border-emerald-300">{c.after}</div>
          )}
        </div>
      ))}
      {total > changes.length && <div className="text-xs text-slate-400">…ועוד {total - changes.length} מקטעים</div>}
    </div>
  )
}

function BlockUserModal({ target, onClose, onDone }) {
  const { showAlert } = useDialog()
  const [reason, setReason] = useState('')
  const [rejectPending, setRejectPending] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/library/users/${target.id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked: true, reason, rejectPending }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה')
      showAlert('בוצע', `המשתמש נחסם מעריכה.${data.rejected ? ` נדחו ${data.rejected} הצעות ממתינות.` : ''}`)
      onDone()
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(ev) => ev.stopPropagation()}>
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-red-600">block</span>
          חסימת משתמש
        </h2>
        <p className="text-slate-600 mb-4">לחסום את <strong>{target.name}</strong> מעריכה במרחב?</p>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבה (אופציונלי)" className="w-full border border-slate-200 rounded-lg px-3 py-2 mb-3" />
        <label className="flex items-center gap-2 text-sm mb-5 cursor-pointer">
          <input type="checkbox" checked={rejectPending} onChange={(e) => setRejectPending(e.target.checked)} />
          דחה גם את כל ההצעות הממתינות שלו
        </label>
        <div className="flex gap-3">
          <button onClick={submit} disabled={busy} className="flex-[2] bg-red-600 text-white py-2.5 rounded-xl font-bold hover:bg-red-700 disabled:opacity-50">{busy ? 'חוסם...' : 'חסום'}</button>
          <button onClick={onClose} disabled={busy} className="flex-1 border border-slate-200 py-2.5 rounded-xl font-bold hover:bg-slate-50">ביטול</button>
        </div>
      </div>
    </div>
  )
}
