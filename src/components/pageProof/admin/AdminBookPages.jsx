'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import AdminPageCard from './AdminPageCard'
import { imageUrl } from '@/lib/pageProof/gridState'
import { CLAIM_NOTE, adminMatches, bulkReleaseMessage, cancelRecutMessage, parsePageRange, rangeLabel, releaseMessage } from '@/lib/pageProof/adminGrid'

// רשת-העמודים של ספר בניהול הגהת-העמודים (נפתחת מ"עמודים" בטבלת הספרים):
// תמונה ממוזערת לכל עמוד עם המצב (פנוי / תפוס — בידי מי ועד מתי / ממתין לאישור /
// אושר / ממתין לזיהוי-מחדש), המתג "פתוח למתנדבים" לכל עמוד ולטווח ("עמודים
// 1–20 פתוחים", "וסגור את כל השאר"), ושחרור תפיסה בידי מנהל — לעמוד, או כל
// התפיסות שפגו / כל התפיסות בספר. השרת: /api/admin/page-proof/books/[gid]/(pages|release).
// עמוד שממתין לזיהוי-מחדש בבקשת מתנדב — "ביטול הבקשה" (release_recut על הבקשה: העמוד חוזר
// אל המתנדב בלי זיהוי-מחדש).
// onChanged — אחרי כל שינוי (מוני טבלת-הספרים).

const FILTERS = [
  { key: 'all', label: 'הכול', count: (c) => c.total },
  { key: 'open', label: 'פנויים', count: (c) => c.open + c.second },
  { key: 'taken', label: 'תפוסים', count: (c) => c.taken },
  { key: 'submitted', label: 'ממתינים לאישור', count: (c) => c.submitted },
  { key: 'approved', label: 'אושרו', count: (c) => c.approved },
  { key: 'recut', label: 'ממתינים לזיהוי-מחדש', count: (c) => c.recut },
  { key: 'closed', label: 'סגורים למתנדבים', count: (c) => c.closed },
  { key: 'expired', label: 'תפיסות שפגו', count: (c) => c.expired },
]

const btn = 'rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40'
const input = 'w-20 rounded-md border border-surface-variant bg-surface px-2 py-1 text-sm'

// שגיאת-רשת / תשובה שאינה JSON ← הודעה בעברית
const failMsg = (e, fallback = 'הפעולה נכשלה — בדקו את החיבור ונסו שוב') =>
  e?.name === 'TypeError' || e?.name === 'SyntaxError' || !e?.message ? fallback : e.message

export default function AdminBookPages({ gid, title = '', onClose, onChanged }) {
  const { showAlert, showConfirm } = useDialog()
  const [data, setData] = useState(null) // {book, pages, counts, loadedAt}
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rangeError, setRangeError] = useState(null)
  const [preview, setPreview] = useState(null)

  const base = `/api/admin/page-proof/books/${encodeURIComponent(gid)}`

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${base}/pages`)
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'הטעינה נכשלה')
      setData({ book: d.book, pages: d.pages || [], counts: d.counts, loadedAt: new Date() })
      setError(null)
    } catch (e) {
      setError(failMsg(e, 'הטעינה נכשלה — בדקו את החיבור ונסו שוב'))
    }
  }, [base])

  useEffect(() => {
    load()
  }, [load])

  // שליחה לשרת; אחריה הרשת נטענת מחדש (גם בשגיאה — המצב אולי השתנה בינתיים).
  // path — יחסי לספר, או כתובת מלאה (מתחילה ב-/)
  const send = async (path, method, body) => {
    setBusy(true)
    try {
      const res = await fetch(path.startsWith('/') ? path : `${base}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!d.success) throw new Error(d.error || 'הפעולה נכשלה')
      await load()
      onChanged?.()
      return d
    } catch (e) {
      showAlert('שגיאה', failMsg(e))
      await load()
      return null
    } finally {
      setBusy(false)
    }
  }

  const toggle = (page, open) => send('pages', 'PATCH', { volunteer: open, ids: [page.id] })

  // חלון-אישור בצורת callback (כמו בכרטיס-העמוד): רק בה החלון מציג את שם הכפתור
  // ("שחרר", "פתח וסגור את השאר"); ביטול — שום דבר לא נשלח
  const confirmThen = (title, message, confirmText, action) => showConfirm(title, message, action, confirmText, 'ביטול')

  // טווח: 'open' — פתח, 'close' — סגור, 'only' — פתח רק אותו וסגור את כל השאר
  const applyRange = (mode) => {
    const r = parsePageRange(from, to)
    if (r.error) {
      setRangeError(r.error)
      return
    }
    setRangeError(null)
    const label = rangeLabel(r)
    const run = async () => {
      const body = mode === 'only' ? { volunteer: true, from: r.from, to: r.to, others: false } : { volunteer: mode === 'open', from: r.from, to: r.to }
      const d = await send('pages', 'PATCH', body)
      if (d) showAlert('בוצע', `${label} ${mode === 'close' ? 'נסגרו' : 'נפתחו'} למתנדבים${mode === 'only' ? ', וכל השאר נסגרו' : ''}. בספר עכשיו ${d.open} עמודים פתוחים ו-${d.closed} סגורים.`)
    }
    if (mode !== 'only') return run()
    confirmThen(
      'פתיחת הטווח בלבד',
      `${label} יהיו פתוחים למתנדבים, וכל שאר עמודי הספר ייסגרו.\nמי שכבר מחזיק בעמוד שנסגר ממשיך בו — רק תפיסה חדשה נחסמת (לשחרור יש כפתור בכל עמוד).`,
      'פתח וסגור את השאר',
      run
    )
  }

  const setAll = (open) =>
    confirmThen(
      open ? 'פתיחת כל הספר' : 'סגירת כל הספר',
      open ? 'כל עמודי הספר יהיו פתוחים למתנדבים.' : 'כל עמודי הספר ייסגרו למתנדבים. מי שכבר מחזיק בעמוד ממשיך בו — רק תפיסה חדשה נחסמת.',
      open ? 'פתח הכול' : 'סגור הכול',
      () => send('pages', 'PATCH', { volunteer: open })
    )

  const release = (page) => confirmThen('שחרור עמוד', releaseMessage(page), 'שחרר', () => send('release', 'POST', { ids: [page.id] }))

  // בקשת מתנדב לזיהוי-מחדש — ביטול ("שחרור מהמתנה" על הבקשה עצמה)
  const cancelRecut = (page) =>
    confirmThen('ביטול בקשה לזיהוי-מחדש', cancelRecutMessage(page), 'בטל את הבקשה', () =>
      send(`/api/admin/page-proof/submissions/${encodeURIComponent(page.recutRequest.id)}`, 'PATCH', { action: 'release_recut' })
    )

  const releaseAll = (scope, n) =>
    confirmThen(scope === 'expired' ? 'ניקוי תפיסות שפגו' : 'שחרור כל התפיסות', bulkReleaseMessage(scope, n), 'שחרר', async () => {
      const d = await send('release', 'POST', { scope })
      if (d) showAlert('בוצע', d.released === 1 ? 'עמוד אחד שוחרר' : `${d.released} עמודים שוחררו`)
    })

  const closePreview = useCallback(() => setPreview(null), [])
  const openPreview = useCallback((page) => setPreview(imageUrl(page)), [])

  const visible = useMemo(() => (data?.pages || []).filter((p) => adminMatches(p, filter)), [data, filter])

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-lg font-bold text-on-surface">
        <span aria-hidden="true" className="material-symbols-outlined text-primary">grid_view</span>
        עמודי הספר{data?.book?.title || title ? `: ${data?.book?.title || title}` : ''}
      </h3>
      <button type="button" onClick={onClose} className={`${btn} hover:bg-surface-variant`}>
        סגירה
      </button>
    </div>
  )

  if (error && !data) {
    return (
      <section aria-label="עמודי הספר" className="glass-strong flex flex-col gap-3 rounded-xl p-4">
        {heading}
        <p role="alert" className="text-danger-700">{error}</p>
      </section>
    )
  }
  if (!data) {
    return (
      <section aria-label="עמודי הספר" className="glass-strong flex flex-col gap-3 rounded-xl p-4">
        {heading}
        <LoadingSpinner message="טוען את עמודי הספר..." />
      </section>
    )
  }

  const c = data.counts
  const claims = c.leased + c.expired
  return (
    <section aria-label="עמודי הספר" className="glass-strong flex flex-col gap-4 rounded-xl p-4">
      {heading}
      <p className="text-xs text-on-surface/60">{CLAIM_NOTE}</p>

      <div className="flex flex-wrap gap-2" role="group" aria-label="סינון עמודים">
        {FILTERS.filter((f) => f.key === 'all' || f.count(c) > 0).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key ? 'border-primary bg-primary text-on-primary' : 'border-surface-variant bg-surface hover:border-primary/50'
            }`}
          >
            {f.label} · {f.count(c).toLocaleString('he-IL')}
          </button>
        ))}
      </div>

      {/* פתוח למתנדבים — לטווח */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-surface-variant/60 bg-surface/40 p-3">
        <span className="w-full text-sm font-bold text-on-surface">פתוח למתנדבים</span>
        <label className="flex items-center gap-1 text-sm">
          מעמוד
          <input type="text" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)} className={input} aria-label="מעמוד" />
        </label>
        <label className="flex items-center gap-1 text-sm">
          עד עמוד
          <input type="text" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)} className={input} aria-label="עד עמוד" />
        </label>
        <button type="button" disabled={busy} onClick={() => applyRange('open')} className={`${btn} bg-success-100 text-success-800 hover:bg-success-200`}>
          פתח את הטווח
        </button>
        <button type="button" disabled={busy} onClick={() => applyRange('close')} className={`${btn} bg-surface-variant/70 hover:bg-surface-variant`}>
          סגור את הטווח
        </button>
        <button type="button" disabled={busy} onClick={() => applyRange('only')} className={`${btn} bg-primary text-on-primary hover:bg-accent`}>
          פתח רק את הטווח וסגור את כל השאר
        </button>
        <span className="flex-1" />
        <button type="button" disabled={busy || c.closed === 0} onClick={() => setAll(true)} className={`${btn} hover:bg-surface-variant`}>
          פתח הכול
        </button>
        <button type="button" disabled={busy || c.closed === c.total} onClick={() => setAll(false)} className={`${btn} hover:bg-surface-variant`}>
          סגור הכול
        </button>
        {rangeError && (
          <p role="alert" className="w-full text-sm text-danger-700">
            {rangeError}
          </p>
        )}
      </div>

      {/* שחרור בבת אחת */}
      {claims > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-on-surface/70">
            {c.leased > 0 && `${c.leased} תפוסים עכשיו`}
            {c.leased > 0 && c.expired > 0 && ' · '}
            {c.expired > 0 && `${c.expired} תפיסות שפגו`}
          </span>
          {c.expired > 0 && (
            <button type="button" disabled={busy} onClick={() => releaseAll('expired', c.expired)} className={`${btn} hover:bg-surface-variant`}>
              נקה תפיסות שפגו
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => releaseAll('all', claims)} className={`${btn} bg-danger-100 text-danger-700 hover:bg-danger-200`}>
            שחרר את כל התפיסות בספר
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-surface-variant py-10 text-center text-on-surface/60">
          {data.pages.length === 0 ? 'אין עמודים בספר' : 'אין עמודים שמתאימים לסינון'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {visible.map((p) => (
            <div key={`${p.id}:${p.revision}`} style={{ contentVisibility: 'auto', containIntrinsicSize: '180px 360px' }}>
              <AdminPageCard page={p} busy={busy} now={data.loadedAt} onToggle={toggle} onRelease={release} onCancelRecut={cancelRecut} onPreview={openPreview} />
            </div>
          ))}
        </div>
      )}

      <ImagePreviewModal isOpen={!!preview} onClose={closePreview} imageSrc={preview} altText="תצוגת עמוד" />
    </section>
  )
}
