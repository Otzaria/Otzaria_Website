'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAsk } from '../useAsk'
import { getJson, sendJson, fmt } from '../api'
import { BTN, Empty, Muted, Tag } from '../bits'
import FramesPagePreview from './FramesPagePreview'
import { FramesEditor } from './framesEditorSlot'
import KeyHint, { Kbd } from './KeyHint'

// סקירת גלאי-האזורים — לפי ספר (docs/75 §2): טבלה של הספרים שיש בהם עמודים שסומנו;
// "פתח לבדיקה" — העמודים של הספר, ועמוד שנבחר נפתח בעורך-המסגרות של סשן ג' במצב review
// (עד שהוא מוכן — תצוגה לקריאה בלבד); "אשר את כל העמודים שסומנו".

const PAGE_TONE = { submitted: 'info', approved: 'ok', held: 'warn', available: 'muted' }
const PAGE_TEXT = { submitted: 'סומן', approved: 'אושר', held: 'בעבודה', available: 'לא סומן' }

function BookReview({ book, onBack, onChanged }) {
  const { showAlert, ask } = useAsk()
  const [data, setData] = useState(null)
  const [cur, setCur] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await getJson(`/review/frames?book=${encodeURIComponent(book)}`)
      setData(d)
      setCur((c) => (c && d.pages.find((p) => p.id === c) ? c : d.pages.find((p) => p.status === 'submitted')?.id || d.pages[0]?.id || null))
    } catch (e) {
      setData({ pages: [], error: e.message })
    }
  }, [book])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה מהשרת; ה-setState קורה אחרי await
    load()
  }, [load])

  const act = async (fn) => {
    setBusy(true)
    try {
      await fn()
      await load()
      onChanged?.()
    } catch (e) {
      showAlert('שגיאה', e.message)
    } finally {
      setBusy(false)
    }
  }
  const decide = (page, decision) => act(() => sendJson('/review/decide', { section: 'frames', ids: [page.id], decision }))
  const approveAll = async () => {
    const n = data.pages.filter((p) => p.status === 'submitted').length
    const yes = await ask(`לאשר ${fmt(n)} עמודים ב${data.book.alias}?`, 'העמודים ייכנסו לקובץ הבא שתורידו לתחנה, כמסגרות מאושרות.', 'אשר')
    if (yes) act(() => sendJson('/review/bulk', { section: 'frames', kind: 'book', book }))
  }

  if (!data) return <Empty>טוען…</Empty>
  if (data.error) return <Empty>{data.error}</Empty>
  const page = data.pages.find((p) => p.id === cur)
  const marked = data.pages.filter((p) => p.status === 'submitted').length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={BTN.quiet} onClick={onBack}>
          <span className="material-symbols-outlined text-sm">chevron_right</span> לכל הספרים
        </button>
        <h3 className="text-lg font-bold">{data.book?.alias} — העמודים באתר</h3>
        <span className="flex-1" />
        <button className={BTN.primary} disabled={busy || !marked} onClick={approveAll}>
          <span className="material-symbols-outlined text-sm">done_all</span> אשר את כל העמודים שסומנו ({fmt(marked)})
        </button>
      </div>
      <div className="flex flex-wrap gap-2" role="list" aria-label="העמודים">
        {data.pages.map((p) => (
          <button
            key={p.id}
            role="listitem"
            onClick={() => setCur(p.id)}
            aria-current={p.id === cur}
            className={`flex w-24 flex-col items-center gap-1 rounded-lg border p-1 text-xs ${p.id === cur ? 'border-primary ring-2 ring-primary' : 'border-surface-variant'}`}
          >
            <img src={p.img} alt="" loading="lazy" className="h-28 w-full rounded bg-white object-contain" />
            <span>עמ' {p.page}</span>
            <Tag tone={PAGE_TONE[p.status]}>{PAGE_TEXT[p.status]}</Tag>
          </button>
        ))}
      </div>
      {page?.status === 'submitted' && FramesEditor && (
        <KeyHint>
          <Kbd>Enter</Kbd> אשר את העמוד (ואם שיניתם מסגרות — תקן ואשר). שאר המקשים — של עורך-המסגרות
        </KeyHint>
      )}
      {page && (
        <div className="glass-strong flex flex-col gap-3 rounded-xl p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <b>עמוד {page.page}</b>
            <Tag tone={PAGE_TONE[page.status]}>{PAGE_TEXT[page.status]}</Tag>
            {page.vol && <span className="text-on-surface/60">סימן: {page.vol.name}</span>}
            {page.result && <span className="text-on-surface/60">· {fmt(page.changes)} מסגרות שונו מהצעת המודל</span>}
            <span className="flex-1" />
            {page.status === 'submitted' && (
              <>
                <button className={BTN.primary} disabled={busy} onClick={() => decide(page, 'approve')}>
                  <span className="material-symbols-outlined text-sm">check</span> אשר את העמוד
                </button>
                <button className={BTN.danger} disabled={busy} onClick={() => decide(page, 'reject')}>
                  דחה
                </button>
              </>
            )}
            {page.status === 'approved' && (
              <button className={BTN.outline} disabled={busy} onClick={() => decide(page, 'unapprove')}>
                <span className="material-symbols-outlined text-sm">undo</span> החזר לממתינות
              </button>
            )}
          </div>
          {FramesEditor ? (
            <FramesEditor
              key={`${page.id}:${page.status}`}
              mode="review"
              page={page}
              streams={data.book?.streams || []}
              onSave={(result) => act(() => sendJson('/review/fix', { id: page.id, mark: result }))}
              onApprove={() => !busy && decide(page, 'approve')}
            />
          ) : (
            <>
              <Muted>תצוגה לקריאה בלבד. תיקון של מסגרות לפני האישור ייעשה בעורך-המסגרות, כשיחובר לכאן.</Muted>
              <FramesPagePreview key={page.id} page={page} streams={data.book?.streams || []} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function FramesReview({ onChanged }) {
  const { showAlert, ask } = useAsk()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)
  const load = useCallback(async () => {
    try {
      setRows((await getJson('/review/frames')).books)
    } catch (e) {
      setRows([])
      showAlert('שגיאה', e.message)
    }
  }, [showAlert])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- טעינה מהשרת; ה-setState קורה אחרי await
    if (!open) load()
  }, [open, load])

  const approveBook = async (r) => {
    const yes = await ask(`לאשר ${fmt(r.counts.submitted)} עמודים ב${r.alias}?`, 'העמודים ייכנסו לקובץ הבא שתורידו לתחנה, כמסגרות מאושרות.', 'אשר')
    if (!yes) return
    try {
      await sendJson('/review/bulk', { section: 'frames', kind: 'book', book: r.book })
      await load()
      onChanged?.()
    } catch (e) {
      showAlert('שגיאה', e.message)
    }
  }

  if (open) return <BookReview book={open} onBack={() => setOpen(null)} onChanged={onChanged} />
  return (
    <div className="flex flex-col gap-3">
      <Muted>
        בגלאי האזורים הסקירה היא לפי ספר: רואים את העמודים שסומנו, פותחים עמוד לבדיקה, ומאשרים עמוד-עמוד או את כל מה שסומן בספר.
      </Muted>
      <div className="glass-strong overflow-x-auto rounded-xl">
        {rows === null ? (
          <Empty>טוען…</Empty>
        ) : !rows.length ? (
          <Empty>אין עדיין עמודים שסומנו</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-variant/50 text-right">
              <tr>
                <th className="p-2">ספר</th>
                <th className="p-2">סימן</th>
                <th className="p-2">ממתינים לאישור</th>
                <th className="p-2">אושרו</th>
                <th className="p-2">שינויים מהצעת המודל</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.book} className="border-t border-surface-variant">
                  <td className="p-2">
                    <b>{r.alias}</b>
                    <div className="text-xs text-on-surface/60">
                      {fmt(r.counts.submitted + r.counts.approved)} מתוך {fmt(r.pagesTotal || r.counts.available + r.counts.held + r.counts.submitted + r.counts.approved)} עמ' סומנו
                      {r.claimedBy && ` · בעבודה אצל ${r.claimedBy}`}
                    </div>
                  </td>
                  <td className="p-2">{r.vols.join(', ') || '—'}</td>
                  <td className="p-2 tabular-nums">{fmt(r.counts.submitted)}</td>
                  <td className="p-2 tabular-nums">{fmt(r.counts.approved)}</td>
                  <td className="p-2 tabular-nums">{fmt(r.changes)} מסגרות</td>
                  <td className="p-2">
                    <div className="flex flex-nowrap gap-1">
                      <button className={BTN.outline} onClick={() => setOpen(r.book)}>
                        פתח לבדיקה
                      </button>
                      <button className={BTN.primary} disabled={!r.counts.submitted} onClick={() => approveBook(r)}>
                        אשר את {fmt(r.counts.submitted)} העמודים
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
