'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/layout/Header'
import { useDialog } from '@/components/providers/DialogContext'
import { canModerateLibrary } from '@/lib/roles'
import { EDIT_TYPE_LABELS, EDIT_KIND } from '@/lib/dicta/edit-constants'
import DiffPreview from '@/components/library/DiffPreview'

export default function ModerationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
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
      router.push(`/library/auth/login?callbackUrl=${encodeURIComponent(pathname)}`)
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

  // אישור חלקי — אישור/דחיית מקטעים נבחרים בתוך הצעה אחת
  const moderateSegments = async (id, payload) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/library/edits/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'moderate-changes', ...payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה')
      if (data.conflicts > 0) {
        showAlert('חלק מהמקטעים בקונפליקט', `אושרו ${data.approved || 0} · נדחו ${data.rejected || 0} · ${data.conflicts} מקטעים לא ניתנים להחלה אוטומטית (הטקסט המקורי השתנה) והוחזרו לתור.`)
      }
      await fetchEdits()
      return true
    } catch (e) {
      showAlert('שגיאה', e.message)
      return false
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
                  onModerateSegments={moderateSegments}
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

function EditCard({ edit, bookName, selected, onToggle, busy, onApprove, onReject, onApprovePattern, onBlock, onModerateSegments }) {
  const isFR = edit.kind === EDIT_KIND.FIND_REPLACE
  const [segs, setSegs] = useState(() => new Set())

  const changes = edit.changes || []
  const pendingCount = changes.filter((c) => (c.status || 'pending') === 'pending').length
  // הצעה שכבר עברה אישור חלקי — חלק מהמקטעים אושרו/נדחו וחלק עדיין ממתין
  const partiallyHandled = pendingCount > 0 && pendingCount < changes.length

  const toggleSeg = (idx) => setSegs((prev) => {
    const n = new Set(prev)
    if (n.has(idx)) n.delete(idx); else n.add(idx)
    return n
  })

  const runSeg = async (kind) => {
    const ids = [...segs]
    if (!ids.length) return
    const ok = await onModerateSegments(edit._id, kind === 'approve' ? { approve: ids } : { reject: ids })
    if (ok) setSegs(new Set())
  }

  // "אשר/דחה הכל" עובר תמיד דרך המסלול הקלאסי (approveEdit/rejectEdit) שפועל על
  // *כל* מקטעי ההצעה בצד השרת — ולכן אינו תלוי ב-50 המקטעים שהוחזרו ללקוח (אחרת
  // "הכל" היה מטעה בהצעות גדולות). approveEdit מחיל כל מקטע שאינו דחוי וטרם הוחל;
  // rejectEdit דוחה רק מקטעים שעדיין ממתינים ושומר מקטעים שכבר אושרו והוחלו.
  const approveAll = onApprove
  const rejectAll = onReject

  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200'}`}>
      <div className="flex items-start gap-3 mb-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1.5 w-4 h-4" title="בחירת ההצעה כולה לפעולה מרובה" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-800 font-frank text-lg">{bookName}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isFR ? 'bg-purple-50 text-purple-600 border border-purple-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
              {isFR ? 'חיפוש והחלפה' : 'עריכה ידנית'}
            </span>
            {edit.editType && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{EDIT_TYPE_LABELS[edit.editType] || edit.editType}</span>}
            <span className="text-xs text-slate-400">
              {partiallyHandled ? `${pendingCount} מתוך ${edit.changeCount} מקטעים ממתינים` : `${edit.changeCount} מקטעים`}
            </span>
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

      {changes.length > 1 && (
        <p className="text-xs text-slate-400 mb-2">סמן מקטעים בודדים כדי לאשר/לדחות רק חלק מההצעה</p>
      )}
      <DiffPreview changes={changes} total={edit.changeCount} selectable selected={segs} onToggle={toggleSeg} />

      {segs.size > 0 && (
        <div className="flex items-center gap-2 mt-3 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2 flex-wrap">
          <span className="font-semibold text-slate-700 text-sm">{segs.size} מקטעים נבחרו</span>
          <button onClick={() => runSeg('approve')} disabled={busy} className="flex items-center gap-1 bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-400 disabled:opacity-50">
            <span className="material-symbols-outlined text-sm">check</span> אשר נבחרים
          </button>
          <button onClick={() => runSeg('reject')} disabled={busy} className="flex items-center gap-1 bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-red-50 disabled:opacity-50">
            <span className="material-symbols-outlined text-sm">close</span> דחה נבחרים
          </button>
          <button onClick={() => setSegs(new Set())} className="mr-auto text-slate-400 hover:text-slate-700 text-sm">נקה בחירה</button>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={approveAll} disabled={busy} className="flex items-center gap-1.5 bg-emerald-500 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-400 disabled:opacity-50">
          <span className="material-symbols-outlined text-base">check</span> {pendingCount > 1 || partiallyHandled ? 'אשר הכל' : 'אשר'}
        </button>
        <button onClick={rejectAll} disabled={busy} className="flex items-center gap-1.5 bg-white border border-red-200 text-red-600 px-4 py-2 rounded-lg font-bold hover:bg-red-50 disabled:opacity-50">
          <span className="material-symbols-outlined text-base">close</span> {pendingCount > 1 || partiallyHandled ? 'דחה הכל' : 'דחה'}
        </button>
      </div>
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
