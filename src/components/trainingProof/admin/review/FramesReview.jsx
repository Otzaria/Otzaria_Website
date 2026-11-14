'use client'

import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import ErrorNotice from '@/components/ui/ErrorNotice'
import ListLoading from '@/components/ui/ListLoading'
import { cardClasses } from '@/components/ui/Card'
import { cx } from '@/components/ui/cx'
import OpenChip from '@/components/admin/list/OpenChip'
import { useAsk } from '../useAsk'
import { getJson, sendJson, fmt } from '../api'
import { Muted, Tag } from '../bits'
import { FramesEditor } from './framesEditorSlot'
import { approveBookLabel, approveConfirm, approveMarkedLabel } from './framesText'
import KeyHint, { Kbd } from './KeyHint'
import { REJECT } from './reviewStyles'

// סקירת גלאי-האזורים — לפי ספר (docs/75 §2): רשימת הספרים שיש בהם עמודים שסומנו;
// "פתח" — העמודים של הספר, ועמוד שנבחר נפתח בעורך-המסגרות במצב review; "אשר את כל העמודים שסומנו".

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
    const c = approveConfirm(n, data.book.alias)
    const yes = await ask(c.title, c.message, 'אשר')
    if (yes) act(() => sendJson('/review/bulk', { section: 'frames', kind: 'book', book }))
  }

  const back = (
    <Button variant="text" size="sm" icon="chevron_right" onClick={onBack} className="self-start">
      לכל הספרים
    </Button>
  )
  if (!data) return <div className="flex flex-col gap-3">{back}<ListLoading rows={2} label="טוען את העמודים…" /></div>
  if (data.error) return <div className="flex flex-col gap-3">{back}<ErrorNotice text={data.error} /></div>
  const page = data.pages.find((p) => p.id === cur)
  const marked = data.pages.filter((p) => p.status === 'submitted').length
  return (
    <div className="flex flex-col gap-4">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 text-title-md text-on-surface">{data.book?.alias} — העמודים באתר</h3>
        <Button variant="tonal" size="sm" icon="done_all" softDisabled={busy || !marked} onClick={approveAll}>
          {approveMarkedLabel(marked)}
        </Button>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="העמודים">
        {data.pages.map((p) => (
          <li key={p.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setCur(p.id)}
              aria-current={p.id === cur ? 'true' : undefined}
              aria-label={`עמוד ${p.page} — ${PAGE_TEXT[p.status]}`}
              className={cx(
                'flex w-24 flex-col items-center gap-1 rounded-(--radius-control) p-1.5 text-label-md text-on-surface transition-colors',
                p.id === cur ? 'bg-surface-selected ring-2 ring-inset ring-primary' : 'bg-surface hover:bg-surface-container-high'
              )}
            >
              <img src={p.img} alt="" loading="lazy" className="h-28 w-full rounded-(--radius-xs) bg-surface-container-low object-contain" />
              <span>עמ&apos; {p.page}</span>
              <Tag tone={PAGE_TONE[p.status]}>{PAGE_TEXT[p.status]}</Tag>
            </button>
          </li>
        ))}
      </ul>
      {page?.status === 'submitted' && (
        <KeyHint>
          <Kbd>Enter</Kbd> אשר את העמוד (ואם שיניתם מסגרות — תקן ואשר). שאר המקשים — של עורך-המסגרות
        </KeyHint>
      )}
      {page && (
        <section aria-label={`עמוד ${page.page}`} className={cardClasses({ padding: 'sm', className: 'flex min-w-0 flex-col gap-3' })}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-title-sm text-on-surface">עמוד {page.page}</span>
            <Tag tone={PAGE_TONE[page.status]}>{PAGE_TEXT[page.status]}</Tag>
            {page.vol && <span className="text-body-sm text-on-surface-variant">סימן: {page.vol.name}</span>}
            {page.result && <span className="text-body-sm text-on-surface-variant">· {fmt(page.changes)} מסגרות שונו מהצעת המודל</span>}
            <span className="flex-1" />
            {page.status === 'submitted' && (
              <>
                <Button variant="filled" size="sm" icon="check" softDisabled={busy} onClick={() => decide(page, 'approve')}>
                  אשר את העמוד
                </Button>
                <Button variant="text" size="sm" icon="block" softDisabled={busy} onClick={() => decide(page, 'reject')} className={REJECT}>
                  דחה
                </Button>
              </>
            )}
            {page.status === 'approved' && (
              <Button variant="text" size="sm" icon="undo" softDisabled={busy} onClick={() => decide(page, 'unapprove')}>
                החזר לממתינות
              </Button>
            )}
          </div>
          <FramesEditor
            key={`${page.id}:${page.status}`}
            mode="review"
            page={page}
            streams={data.book?.streams || []}
            onSave={(result) => act(() => sendJson('/review/fix', { id: page.id, mark: result }))}
            onApprove={() => !busy && decide(page, 'approve')}
          />
        </section>
      )}
    </div>
  )
}

// ספר אחד ברשימה: שם, כמה סומנו מתוך כמה, מי סימן, המונים — ו"פתח" (צ'יפ שקט) · "אשר את N העמודים"
function BookRow({ r, onOpen, onApprove }) {
  const total = r.pagesTotal || r.counts.available + r.counts.held + r.counts.submitted + r.counts.approved
  return (
    <li className={cardClasses({ padding: 'sm', className: 'flex flex-col gap-3 sm:flex-row sm:items-center' })}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-title-sm text-on-surface">{r.alias}</span>
        <span className="text-body-sm text-on-surface-variant">
          {fmt(r.counts.submitted + r.counts.approved)} מתוך {fmt(total)} עמ&apos; סומנו
          {r.vols.length > 0 && ` · סימן: ${r.vols.join(', ')}`}
          {r.claimedBy && ` · בעבודה אצל ${r.claimedBy}`}
        </span>
        <span className="flex flex-wrap gap-1.5">
          <Tag tone={r.counts.submitted ? 'info' : 'muted'}>{fmt(r.counts.submitted)} ממתינים לאישור</Tag>
          <Tag tone={r.counts.approved ? 'ok' : 'muted'}>{fmt(r.counts.approved)} אושרו</Tag>
          <Tag>{fmt(r.changes)} מסגרות שונו מהמודל</Tag>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <OpenChip onClick={onOpen} label={`פתח את ${r.alias}`} />
        <Button variant="tonal" size="sm" icon="done_all" disabled={!r.counts.submitted} onClick={onApprove}>
          {approveBookLabel(r.counts.submitted)}
        </Button>
      </div>
    </li>
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
    const c = approveConfirm(r.counts.submitted, r.alias)
    const yes = await ask(c.title, c.message, 'אשר')
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
    <div className="flex flex-col gap-4">
      <Muted>
        בגלאי האזורים הסקירה היא לפי ספר: רואים את העמודים שסומנו, פותחים עמוד לבדיקה, ומאשרים עמוד-עמוד או את כל מה שסומן בספר.
      </Muted>
      {rows === null ? (
        <ListLoading rows={2} label="טוען את הספרים…" />
      ) : !rows.length ? (
        <EmptyState icon="task_alt" title="אין עדיין עמודים שסומנו" description="כשמתנדבים יסמנו עמודים בגלאי האזורים, הספרים יופיעו כאן." />
      ) : (
        <ul aria-label="הספרים" className="flex flex-col gap-3">
          {rows.map((r) => (
            <BookRow key={r.book} r={r} onOpen={() => setOpen(r.book)} onApprove={() => approveBook(r)} />
          ))}
        </ul>
      )}
    </div>
  )
}
