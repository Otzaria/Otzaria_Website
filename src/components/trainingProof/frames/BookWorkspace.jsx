'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import AppIcon from '@/components/ui/AppIcon'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import FramesEditor from './FramesEditor'
import FramesGuide from './FramesGuide'
import StreamsPanel from './StreamsPanel'
import GuideBox from '../common/GuideBox'
import { framesApi, formatUntil } from './api'
import { checkFramesPage, isDoneState } from './rules'
import { PAGE_STATE_LABELS, ROLE_LABELS } from './look'
import { syncRoles, streamUsage } from './streamRoles'

// עבודת המתנדב על ספר אחד בגלאי האזורים: עמודים ממוזערים עם מצב לכל עמוד, העורך (FramesEditor) לעמוד
// הנוכחי, ו"העמוד נכון"/דלג/הבא/הקודם. כל שינוי נשמר מיד בשרת (ה-4): טיוטה אחרי כל שינוי, ו-Enter שומר
// את העמוד כמסומן ועובר לעמוד הבא שעוד לא סומן. השמירות של עמוד יוצאות אחת-אחת, והאחרונה גוברת.

const LIST_HREF = '/library/page-proof/frames'

function useSaver({ onSaved, onError }) {
  const latest = useRef({})
  const chain = useRef({})
  const [pending, setPending] = useState(0)
  const save = useCallback(
    (id, status, frames) => {
      const v = (latest.current[id]?.v || 0) + 1
      latest.current[id] = { v, status, frames }
      setPending((n) => n + 1)
      const run = (chain.current[id] || Promise.resolve()).then(async () => {
        const cur = latest.current[id]
        if (cur.v !== v) return { superseded: true }
        const r = await framesApi.savePage(id, cur.status, cur.frames)
        if (r.ok) onSaved(id, r.data, latest.current[id].v === v)
        else onError(id, r, { status: cur.status, frames: cur.frames })
        return r
      })
      chain.current[id] = run.catch(() => {})
      return run.finally(() => setPending((n) => n - 1))
    },
    [onSaved, onError]
  )
  return { save, pending }
}

function Thumb({ p, i, current, onPick }) {
  const by = p.by && p.by !== 'you' && p.state !== 'proposed' ? ` · ${p.by}` : ''
  return (
    <button
      type="button"
      onClick={() => onPick(i)}
      aria-current={current ? 'page' : undefined}
      data-testid="thumb"
      data-state={p.state}
      className={`flex w-24 shrink-0 flex-col items-center gap-1 rounded-control border-2 bg-surface p-1 text-center text-label-sm lg:w-full ${
        current ? 'border-primary ring-2 ring-primary/30' : 'border-outline-variant hover:border-outline'
      } ${p.state === 'marked' || p.state === 'approved' ? 'bg-success-container/40' : ''}`}
    >
      <img src={p.thumb} alt="" loading="lazy" className="block w-full rounded-sm" style={{ aspectRatio: `${p.w} / ${p.h}` }} />
      <span className="font-bold">עמ' {p.page ?? i + 1}</span>
      <span className="text-on-surface-variant">
        {PAGE_STATE_LABELS[p.state]}
        {by}
      </span>
    </button>
  )
}

export default function BookWorkspace({ bookKey }) {
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()
  const [data, setData] = useState(null) // {book, pages}
  const [err, setErr] = useState(null) // {status, error}
  const [cur, setCur] = useState(0)
  const [snap, setSnap] = useState(true)
  const [saveErr, setSaveErr] = useState(null)
  const [lost, setLost] = useState(false) // הספר כבר לא אצלך
  const live = useRef({}) // id → המסגרות כפי שהן בעורך עכשיו

  useEffect(() => {
    let alive = true
    framesApi.book(bookKey).then((r) => {
      if (!alive) return
      if (!r.ok) return setErr({ status: r.status, error: r.data.error || 'הטעינה נכשלה' })
      setData(r.data)
      // נפתח בעמוד הראשון שעוד לא סומן — גם כשממשיכים ספר של מתנדב אחר
      const first = r.data.pages.findIndex((p) => !isDoneState(p.state))
      setCur(first >= 0 ? first : 0)
    })
    return () => {
      alive = false
    }
  }, [bookKey])

  const setPage = useCallback((id, patch) => {
    setData((d) => (d ? { ...d, pages: d.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : d))
  }, [])

  const onSaved = useCallback(
    (id, res, isLatest) => {
      setSaveErr(null)
      const pg = res.page
      setPage(id, isLatest ? { state: pg.state, by: pg.by, frames: pg.frames } : { state: pg.state, by: pg.by })
      if (res.bookDone) showAlert('הספר הושלם', 'כל העמודים סומנו — תודה! המנהל יעבור עליהם.')
    },
    [setPage, showAlert]
  )
  const onError = useCallback((id, r, body) => {
    if (r.status === 409 && /לא אצלך/.test(r.data.error || '')) setLost(true)
    setSaveErr({ id, error: r.data.error || 'השמירה נכשלה', body })
  }, [])
  const { save, pending } = useSaver({ onSaved, onError })

  const pages = useMemo(() => data?.pages || [], [data])
  const page = pages[cur]
  const book = data?.book
  const streams = useMemo(() => book?.streams || [], [book])
  const done = pages.filter((p) => isDoneState(p.state)).length
  const editable = page && page.state !== 'approved' && !lost

  const go = useCallback((i) => setCur(Math.max(0, Math.min(pages.length - 1, i))), [pages.length])
  const nextOpen = useCallback(
    (from) => {
      for (let k = 1; k <= pages.length; k++) {
        const i = (from + k) % pages.length
        if (!isDoneState(pages[i].state) && i !== from) return i
      }
      return -1
    },
    [pages]
  )

  const onChange = useCallback(
    (frames, { save: doSave }) => {
      if (!page) return
      live.current[page.id] = frames
      if (!doSave) return
      setPage(page.id, { frames, state: 'draft', by: 'you' })
      save(page.id, 'draft', frames)
    },
    [page, save, setPage]
  )

  const finish = useCallback(
    async (status) => {
      if (!page || !editable) return
      const frames = live.current[page.id] || page.frames
      const check = checkFramesPage({ w: page.w, h: page.h }, { status, frames }, { streams })
      if (check.error) return showAlert('אי-אפשר לאשר עדיין', check.error)
      setPage(page.id, { state: status, by: 'you' })
      const here = cur
      const r = await save(page.id, status, frames)
      if (r && !r.ok && !r.superseded) return
      const n = nextOpen(here)
      if (n >= 0) setCur(n)
    },
    [page, editable, streams, cur, save, setPage, nextOpen, showAlert]
  )

  const addStream = useCallback(
    async (name, role) => {
      const r = await framesApi.addStream(bookKey, name, role)
      if (!r.ok) throw new Error(r.data.error || 'הזרם לא נוסף')
      setData((d) => ({ ...d, book: { ...d.book, streams: r.data.streams } }))
      return r.data.stream
    },
    [bookKey]
  )

  // הסוג של זרם שנוסף באתר — בכל המסגרות שלו בספר. מחזיר true כשנשמר
  const setStreamKind = useCallback(
    (s, role) =>
      new Promise((resolve) => {
        const all = pages.map((p) => ({ frames: live.current[p.id] || p.frames }))
        const u = streamUsage(all, s.id)
        const where = !u.frames
          ? ''
          : u.frames === 1
            ? ' הסוג ישתנה גם במסגרת היחידה שלו.'
            : ` הסוג ישתנה בכל ${u.frames} המסגרות שלו, ${u.pages === 1 ? 'בעמוד אחד' : `ב-${u.pages} עמודים`}.`
        showConfirm(
          'לשנות את הסוג של הזרם?',
          `הזרם "${s.name}" יהיה "${ROLE_LABELS[role]}" במקום "${ROLE_LABELS[s.role] || ''}".${where}${s.added ? '' : ' השינוי יחזור לתחנה עם העמודים.'}`,
          async () => {
            const r = await framesApi.setStreamKind(bookKey, s.id, role)
            if (!r.ok) {
              showAlert('הסוג לא השתנה', r.data.error || 'נסו שוב')
              return resolve(false)
            }
            const next = r.data.streams
            for (const id of Object.keys(live.current)) live.current[id] = syncRoles(live.current[id], next)
            setData((d) => ({ ...d, book: { ...d.book, streams: next }, pages: d.pages.map((p) => ({ ...p, frames: syncRoles(p.frames, next) })) }))
            resolve(true)
          },
          'שנה',
          'ביטול'
        )
      }),
    [pages, bookKey, showAlert, showConfirm]
  )

  const release = useCallback(() => {
    showConfirm(
      'לשחרר את הספר?',
      'הסימונים שלך נשמרים. הספר יחזור לרשימה כ"הופסק באמצע", ומתנדב אחר יוכל להמשיך ממנו ויראה את העבודה שלך.',
      async () => {
        const r = await framesApi.release(bookKey)
        if (!r.ok) return showAlert('לא שוחרר', r.data.error || 'נסו שוב')
        router.push(LIST_HREF)
      },
      'שחרר',
      'ביטול'
    )
  }, [bookKey, router, showAlert, showConfirm])

  // חצים: ← הבא, → הקודם (כמו בתחנה)
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(cur + 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(cur - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cur, go])

  const counts = useMemo(() => `${done}/${pages.length} עמודים`, [done, pages.length])

  if (err) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-card bg-surface p-6 shadow-raised" data-testid="book-error">
        <p className="text-body-lg">{err.status === 403 && /הרשאת גישה/.test(err.error) ? 'אין לך הרשאת גישה לדף זה' : err.error}</p>
        <Button href={LIST_HREF} variant="tonal" icon="arrow_forward">
          לרשימת הספרים
        </Button>
      </div>
    )
  }
  if (!data) return <LoadingSpinner message="טוען את הספר…" />
  if (!pages.length) {
    return (
      <div className="rounded-card bg-surface p-6 shadow-raised">
        <p>אין בספר הזה עמודים לעבודה.</p>
        <Link href={LIST_HREF} className="text-primary underline">
          לרשימת הספרים
        </Link>
      </div>
    )
  }

  const saveLine =
    pending > 0 ? (
      <span className="text-on-surface-variant">שומר…</span>
    ) : saveErr ? (
      <span className="flex items-center gap-1 text-error" data-testid="save-error">
        <AppIcon name="error" className="text-base" /> לא נשמר: {saveErr.error}
        {!lost && (
          <button type="button" className="underline" onClick={() => save(saveErr.id, saveErr.body.status, saveErr.body.frames)}>
            נסו שוב
          </button>
        )}
      </span>
    ) : (
      <span className="flex items-center gap-1 text-success" data-testid="saved">
        <AppIcon name="cloud_sync" className="text-base" /> כל השינויים נשמרו
      </span>
    )

  const stateNote =
    page.state === 'approved' ? (
      <Badge tone="info">המנהל אישר את העמוד — קריאה בלבד</Badge>
    ) : page.state === 'marked' ? (
      <Badge tone="success">{page.by && page.by !== 'you' ? `סומן בידי ${page.by} — אפשר לתקן, ואז Enter` : 'סימנת שהעמוד נכון'}</Badge>
    ) : page.state === 'skip' ? (
      <Badge tone="neutral">{page.by && page.by !== 'you' ? `${page.by} דילג על העמוד` : 'דילגת על העמוד'}</Badge>
    ) : page.state === 'draft' ? (
      <Badge tone="warning">{page.by && page.by !== 'you' ? `${page.by} התחיל לסמן — אפשר להמשיך` : 'בעבודה — עוד לא אישרת'}</Badge>
    ) : (
      <Badge tone="neutral">הצעת המודל — המסגרות המקווקוות הן של המודל</Badge>
    )

  const side = (
    <div className="flex flex-col gap-2.5 rounded-card bg-surface p-3.5 shadow-raised" data-testid="page-actions">
      <div className="text-label-md">{stateNote}</div>
      <Button variant="filled" icon="check" disabled={!editable} onClick={() => finish('marked')} data-testid="page-ok">
        העמוד נכון (כולל הסדר) <kbd className="ms-1 text-label-sm opacity-80">Enter</kbd>
      </Button>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outlined" icon="chevron_right" disabled={cur === 0} onClick={() => go(cur - 1)}>
          הקודם
        </Button>
        <Button size="sm" variant="outlined" iconEnd="chevron_left" disabled={cur === pages.length - 1} onClick={() => go(cur + 1)}>
          הבא
        </Button>
        <Button size="sm" variant="text" icon="skip_next" disabled={!editable} onClick={() => finish('skip')}>
          דלג — לא לאימון
        </Button>
      </div>
      <div className="text-label-md">{saveLine}</div>
    </div>
  )
  const sideAll = (
    <>
      {side}
      <StreamsPanel streams={streams} pages={pages} readOnly={lost} onSetKind={setStreamKind} />
    </>
  )

  return (
    <div className="flex flex-col gap-4" data-testid="book-workspace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-headline-md text-on-surface">{book.alias || 'ספר'}</h1>
          {book.claimedUntil && (
            <Badge tone="info" icon="schedule">
              שמור לך עד {formatUntil(book.claimedUntil)}
            </Badge>
          )}
          <Badge tone="neutral">{counts}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outlined" icon="lock_open" onClick={release} disabled={lost}>
            שחרר את הספר
          </Button>
          <Button size="sm" variant="text" icon="arrow_forward" href={LIST_HREF}>
            לרשימת הספרים
          </Button>
        </div>
      </div>

      {lost && (
        <div className="flex items-center gap-2 rounded-control bg-error-container p-3 text-on-error-container" role="alert">
          <AppIcon name="lock" /> הספר כבר לא אצלך (עברו 48 שעות, או שהוא שוחרר). מה שנשמר עד עכשיו נשאר בספר.
          <Link href={LIST_HREF} className="font-bold underline">
            לרשימת הספרים
          </Link>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[8.5rem_minmax(0,1fr)]">
        <nav aria-label="עמודי הספר" className="flex gap-2 overflow-x-auto p-0.5 lg:max-h-[85vh] lg:flex-col lg:overflow-y-auto" data-testid="thumbs">
          {pages.map((p, i) => (
            <Thumb key={p.id} p={p} i={i} current={i === cur} onPick={go} />
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-3">
          <FramesEditor
            key={page.id}
            mode={editable ? 'edit' : 'readOnly'}
            page={page}
            streams={streams}
            onChange={onChange}
            onConfirm={() => finish('marked')}
            onAddStream={addStream}
            snap={snap}
            onSnapChange={setSnap}
            sideExtra={sideAll}
          />
          <GuideBox section="frames" />
          <FramesGuide />
        </div>
      </div>
    </div>
  )
}
