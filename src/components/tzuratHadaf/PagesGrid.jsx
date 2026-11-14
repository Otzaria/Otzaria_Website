'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import { useDialog } from '@/components/providers/DialogContext'
import PageCard from './PageCard'
import { AccessNotice } from './TzuratShell'
import { api } from './api'
import { DEFAULT_MAX_HELD, heldSplit, maxHeldNote, pickSlug, stateCounts } from './gridLogic'
import { num, pageStateUi, pagesPath, pct, reviewPath } from './labels'

// רשת העמודים של מסכת (?m=slug): בחירת מסכת, כרטיס לכל עמוד עם המצב, "העמודים שבידי", ולקיחת עמוד —
// POST claim ואז מעבר לבדיקת העמוד. CONTRACT: GET books/[slug]/pages → {book, pages, held, maxHeld}.

export default function PagesGrid({ slug: wanted }) {
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()
  const [books, setBooks] = useState(null)
  const [slug, setSlug] = useState(null)
  const [data, setData] = useState(null)
  const [fail, setFail] = useState(null)
  const [busy, setBusy] = useState(false)
  const selectId = useId()

  useEffect(() => {
    let alive = true
    api.overview().then((r) => {
      if (!alive) return
      if (r.ok) setBooks(r.data.books || [])
      else setFail({ status: r.status, error: r.error })
    })
    return () => {
      alive = false
    }
  }, [])

  // המסכת לפי הכתובת (?m=); בלי — הראשונה, והכתובת מתעדכנת
  useEffect(() => {
    if (!books) return
    const s = pickSlug(books, wanted)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlug(s)
    if (s && s !== wanted) router.replace(pagesPath(s))
  }, [books, wanted, router])

  const load = useCallback(async (s) => {
    if (!s) return
    setData(null)
    const r = await api.bookPages(s)
    if (r.ok) {
      setData(r.data)
      setFail(null)
    } else setFail({ status: r.status, error: r.error })
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(slug)
  }, [slug, load])

  const maxHeld = data?.maxHeld || DEFAULT_MAX_HELD
  const { here, elsewhere } = heldSplit(data?.pages, data?.held)
  const heldCount = (data?.held || []).length

  const claim = async (page) => {
    const ok = await showConfirm(
      `בדיקת דף ${page.daf}`,
      'העמוד יישמר לכם 48 שעות (שבת וחג אינם נספרים), ויפתח לבדיקה. אפשר לשחרר אותו בכל רגע.',
      undefined,
      'קח את העמוד',
      'ביטול'
    )
    if (!ok) return
    setBusy(true)
    const r = await api.claim(page.id)
    setBusy(false)
    if (r.ok) router.push(reviewPath(page.id))
    else {
      showAlert('לא ניתן לקחת את העמוד', r.error)
      load(slug)
    }
  }

  const book = data?.book

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-strong flex flex-wrap items-center gap-3 rounded-xl p-4">
        <label htmlFor={selectId} className="font-bold text-on-surface">
          מסכת:
        </label>
        <select
          id={selectId}
          value={slug || ''}
          disabled={!books?.length}
          onChange={(e) => router.replace(pagesPath(e.target.value))}
          className="min-h-10 rounded-lg border border-outline-variant bg-surface px-3 text-on-surface"
        >
          {(books || [])
            .slice()
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.masechet}
              </option>
            ))}
        </select>
        {book && (
          <span className="text-sm text-on-surface/70">
            הושלמו {num(book.pagesDone)} מתוך {num(book.pages)} עמודים ({pct(book.pagesDone, book.pages)}%)
          </span>
        )}
      </div>

      {fail && <AccessNotice status={fail.status} error={fail.error} onRetry={() => load(slug)} />}
      {books && !books.length && <p className="text-on-surface/60">עדיין לא יובאו מסכתות לבדיקה.</p>}

      {data && (
        <section className="glass-strong flex flex-col gap-2 rounded-xl p-4" aria-labelledby="th-held" data-testid="held-panel">
          <h2 id="th-held" className="font-bold text-on-surface">
            העמודים שבידי ({num(heldCount)} מתוך {num(maxHeld)})
          </h2>
          {heldCount === 0 && here.length === 0 ? (
            <p className="text-sm text-on-surface/60">אין בידיכם עמודים כרגע. בחרו עמוד פנוי מהרשת.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {here.map((p) => (
                <li key={p.id}>
                  <Link href={reviewPath(p.id)} prefetch={false} className="inline-flex items-center gap-1 rounded-full bg-info-100 px-3 py-1 font-bold text-info-800 hover:bg-info-200">
                    <span aria-hidden="true" className="material-symbols-outlined text-base">edit</span>
                    {book?.masechet} {p.daf}
                  </Link>
                </li>
              ))}
              {elsewhere.map((id, k) => (
                <li key={id}>
                  <Link href={reviewPath(id)} prefetch={false} className="inline-flex items-center gap-1 rounded-full bg-surface-variant px-3 py-1 text-on-surface hover:bg-surface-variant/70">
                    עמוד במסכת אחרת {elsewhere.length > 1 ? num(k + 1) : ''}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {heldCount >= maxHeld && (
            <p role="status" className="text-sm font-medium text-warning-alt-800">
              {maxHeldNote(maxHeld)}
            </p>
          )}
        </section>
      )}

      {data && (
        <>
          <ul className="flex flex-wrap gap-2" aria-label="מקרא מצבים">
            {stateCounts(data.pages).map(({ state, count }) => {
              const ui = pageStateUi(state)
              return (
                <li key={state}>
                  <Badge tone={ui.tone} icon={ui.icon}>
                    {ui.label}: {num(count)}
                  </Badge>
                </li>
              )
            })}
          </ul>
          {data.pages?.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8" aria-label="העמודים">
              {data.pages.map((p) => (
                <PageCard key={p.id} page={p} heldCount={heldCount} maxHeld={maxHeld} onClaim={claim} busy={busy} />
              ))}
            </ul>
          ) : (
            <p className="text-on-surface/60">אין עמודים במסכת הזו.</p>
          )}
        </>
      )}
      {!data && !fail && slug && (
        <p className="text-on-surface/60" role="status">
          טוען עמודים...
        </p>
      )}
    </div>
  )
}
