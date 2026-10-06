'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useDialog } from '@/components/providers/DialogContext'
import { useLoading } from '@/components/providers/LoadingContext'
import ProofPageCard from './ProofPageCard'
import ProofStatCards from './ProofStatCards'
import ProofSequenceRow from './ProofSequenceRow'
import ProofProgressBar from './ProofProgressBar'
import { apiDelete, apiGet, apiPost } from '@/lib/api-utils'
import {
  CLAIM_HOURS,
  CLAIM_SHORT,
  MAX_HELD,
  SEQ_HINT,
  SEQ_SIZE,
  editorHref,
  failMessage,
  groupBySequence,
  imageUrl,
  matchesFilter,
  scriptLabel,
} from '@/lib/pageProof/gridState'

// רשת-העמודים של ספר בהגהת-עמודים (/library/page-proof/books/[gid]) — בנויה
// כמו דף הספר בעריכה הישנה (/library/books/[path]): כותרת דביקה עם חזרה
// לרשימה, כרטיסי-מונים שהם גם מסננים, "כל העמודים / העמודים שלי", תצוגה
// רגילה/צפופה, וכרטיס לכל עמוד. בנוסף: "הצג ברצפים של 5" — הכרטיסים בשורות
// לפי הרצף, עם "תפוס את 5 העמודים". זה המקום היחיד שבו עמודים נתפסים — ורק
// בלחיצה (אין חלוקה אוטומטית). עמודים שהמנהל סגר להגהה אינם מוצגים (hidden
// — כמה כאלה, להסבר).

const GRID = {
  single: 'grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  double: 'grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10',
}
// שורה של רצף (עד 5 כרטיסים)
const SEQ_GRID = {
  single: 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5',
  double: 'grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10',
}

const TOGGLE = 'rounded-md px-3 py-1.5 text-sm font-medium transition-all'
const TOGGLE_ON = 'bg-white text-primary shadow-sm'
const TOGGLE_OFF = 'text-on-surface/60 hover:bg-surface-variant hover:text-on-surface'
const VIEW_BTN = 'rounded p-2 transition-colors'
const VIEW_ON = 'bg-primary text-on-primary'

function ErrorBox({ message }) {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="glass-strong max-w-md rounded-2xl p-8 text-center">
        <span aria-hidden="true" className="material-symbols-outlined mb-4 block text-6xl text-danger-500">error</span>
        <h2 className="mb-2 text-2xl font-bold text-on-surface">שגיאה</h2>
        <p className="mb-4 text-on-surface/70">{message}</p>
        <Link
          href="/library/page-proof/books"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-on-primary transition-colors hover:bg-accent"
        >
          <span aria-hidden="true" className="material-symbols-outlined">arrow_forward</span>
          <span>חזרה לרשימת הספרים</span>
        </Link>
      </div>
    </div>
  )
}

export default function ProofBookGrid({ gid }) {
  const router = useRouter()
  const { showAlert, showConfirm } = useDialog()
  const { startLoading, stopLoading } = useLoading()

  const [data, setData] = useState(null) // {book, pages, counts, loadedAt}
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [ownership, setOwnership] = useState('all')
  const [viewMode, setViewMode] = useState('single')
  const [bySeq, setBySeq] = useState(false)
  const [preview, setPreview] = useState(null)

  const load = useCallback(async () => {
    try {
      const d = await apiGet(`/api/page-proof/books/${encodeURIComponent(gid)}`)
      setData({ book: d.book, pages: d.pages || [], counts: d.counts, hidden: d.hidden || 0, loadedAt: new Date() })
      setError(null)
    } catch (e) {
      setError(failMessage(e, 'שגיאה בטעינת הספר — בדקו את החיבור ונסו שוב'))
    }
  }, [gid])

  useEffect(() => {
    load()
  }, [load])

  // פעולה עם מסך-המתנה; שגיאה ← הודעה, והרשת נטענת מחדש (המצב השתנה בינתיים)
  const run = async (message, action) => {
    setBusy(true)
    startLoading(message)
    try {
      return await action()
    } catch (e) {
      stopLoading()
      showAlert('שגיאה', failMessage(e, 'הפעולה נכשלה — בדקו את החיבור ונסו שוב'))
      await load()
      return null
    } finally {
      stopLoading()
      setBusy(false)
    }
  }

  // "תפוס ועבוד" / "תפוס כבודק שני" (אחרי האישור בכרטיס) ← העורך. הרשת
  // מתרעננת ברקע, כדי שעד שהעורך נפתח הכרטיס כבר יראה "בטיפולך"
  const claim = (page) =>
    run(`תופס את עמוד ${page.page}...`, async () => {
      await apiPost(`/api/page-proof/pages/${page.id}/claim`, {})
      router.push(editorHref(page.id))
      load()
    })

  const release = (page) =>
    run('משחרר עמוד ומעדכן נתונים...', async () => {
      await apiDelete(`/api/page-proof/pages/${page.id}/claim`)
      await load()
      stopLoading()
      showAlert('בוצע', `עמוד ${page.page} שוחרר וחזר למאגר`)
    })

  const claimSequence = (group) =>
    run('תופס את הרצף...', async () => {
      const d = await apiPost(`/api/page-proof/books/${encodeURIComponent(gid)}/claim-seq`, { seq: group.seq })
      await load()
      stopLoading()
      // d.pages — כל העמודים ברצף שנשמרו עכשיו עבור המשתמש (כולל שכבר היו שלו);
      // d.limited — עמודים פנויים ברצף שלא נתפסו בגלל התקרה (MAX_HELD)
      const got = d.pages || []
      const first = got[0]
      if (!first) return
      const cap = d.limited > 0 ? `\nאפשר להחזיק עד ${MAX_HELD} עמודים בבת אחת — ${d.limited === 1 ? 'עמוד אחד ברצף נשאר פנוי' : `${d.limited} עמודים ברצף נשארו פנויים`}.` : ''
      showConfirm(
        'הרצף נתפס',
        `${got.length === 1 ? `עמוד ${first.page} נשמר` : `${got.length} עמודים נשמרו (${got.map((p) => p.page).join(', ')})`} עבורכם ל-${CLAIM_HOURS} שעות.${cap}\nלפתוח עכשיו את עמוד ${first.page} בעורך?`,
        () => router.push(editorHref(first.id)),
        'פתח בעורך',
        'אחר כך'
      )
    })

  const closePreview = useCallback(() => setPreview(null), [])
  const openPreview = useCallback((page) => setPreview(imageUrl(page)), [])

  const counts = data?.counts
  // כרטיס "ממתינים לזיהוי-מחדש" נעלם כשאין כאלה — אז גם הסינון שלו
  const activeFilter = filter === 'recut' && !(counts?.recut > 0) ? 'all' : filter

  const visible = useMemo(
    () => (data?.pages || []).filter((p) => matchesFilter(p.state, activeFilter, ownership)),
    [data, activeFilter, ownership]
  )
  const groups = useMemo(() => (bySeq && data ? groupBySequence(data.pages, SEQ_SIZE) : []), [bySeq, data])
  const firstMine = useMemo(() => (data?.pages || []).find((p) => p.state === 'mine'), [data])

  if (error && !data) return <ErrorBox message={error} />
  if (!data) return <LoadingSpinner message="טוען את הספר..." size="lg" />

  const { book } = data
  const visibleIds = new Set(visible.map((p) => p.id))
  const card = (p) => (
    <div key={`${p.id}:${p.revision}`} className="relative" style={{ contentVisibility: 'auto', containIntrinsicSize: '300px 400px' }}>
      <ProofPageCard
        page={p}
        canClaimNew={book.active}
        busy={busy}
        compact={viewMode === 'double'}
        now={data.loadedAt}
        onClaim={claim}
        onRelease={release}
        onPreview={openPreview}
      />
    </div>
  )

  return (
    <>
      {/* כותרת דביקה (מהטאבלט ומעלה) — מתחת לכותרת האתר */}
      <header className="glass-strong z-40 border-b border-surface-variant md:sticky md:top-16">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/library/page-proof/books"
              aria-label="חזרה לרשימת הספרים"
              className="flex items-center gap-2 text-on-surface transition-colors hover:text-primary"
            >
              <span aria-hidden="true" className="material-symbols-outlined">arrow_forward</span>
              <span className="hidden sm:inline">חזרה לרשימת הספרים</span>
            </Link>
            <div className="h-8 w-px bg-surface-variant" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info-100">
                <span aria-hidden="true" className="material-symbols-outlined text-xl text-info-600">fact_check</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-on-surface">{book.title}</h1>
                <p className="text-sm text-on-surface/60">
                  {counts.total.toLocaleString('he-IL')} עמודים
                  {scriptLabel(book.script) ? ` · ${scriptLabel(book.script)}` : ''}
                </p>
              </div>
            </div>
          </div>
          {firstMine && (
            <Link
              href={editorHref(firstMine.id)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-colors hover:bg-accent"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-lg">edit</span>
              <span>המשך לעבוד ({counts.mine} בטיפולך)</span>
            </Link>
          )}
        </div>
      </header>

      <div className="container mx-auto flex-grow px-4 py-8">
        <div className="mx-auto max-w-7xl">
          {!book.active && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-warning-alt-200 bg-warning-alt-50 p-4 text-warning-alt-800">
              <span aria-hidden="true" className="material-symbols-outlined">pause_circle</span>
              הספר מושהה כרגע: אפשר להמשיך בעמודים שכבר בטיפולכם, אבל לא לתפוס עמודים חדשים.
            </div>
          )}
          {/* עמודים שהמנהל סגר למתנדבים אינם מוצגים ואינם נספרים — וגם לא ההודעה כמה הם (בעל הפרויקט, 2026-10-06):
              זה עניין של המנהל, ובדף-הניהול הוא רואה אותם */}
          <ProofStatCards counts={counts} active={activeFilter} onSelect={setFilter} />

          <div className="glass mb-8 rounded-xl border border-surface-variant/30 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-bold text-on-surface">התקדמות הספר</span>
              <span className="text-on-surface/60">{counts.total.toLocaleString('he-IL')} סה"כ</span>
            </div>
            <ProofProgressBar counts={counts} legend="labels" />
            <p className="mt-3 flex items-center gap-1 text-xs text-on-surface/60">
              <span aria-hidden="true" className="material-symbols-outlined text-sm">schedule</span>
              {CLAIM_SHORT}
            </p>
          </div>

          <div className="glass-strong rounded-2xl border border-surface-variant/30 p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <h2 className="text-2xl font-bold text-on-surface">עמודי הספר</h2>

                <div className="flex rounded-lg bg-surface-variant/30 p-1">
                  <button type="button" onClick={() => setOwnership('all')} aria-pressed={ownership === 'all'} className={`${TOGGLE} ${ownership === 'all' ? TOGGLE_ON : TOGGLE_OFF}`}>
                    כל העמודים
                  </button>
                  <button type="button" onClick={() => setOwnership('mine')} aria-pressed={ownership === 'mine'} className={`${TOGGLE} ${ownership === 'mine' ? TOGGLE_ON : TOGGLE_OFF}`}>
                    העמודים שלי
                  </button>
                </div>

                <div className="flex rounded-lg bg-surface-variant/30 p-1">
                  <button
                    type="button"
                    onClick={() => setBySeq((v) => !v)}
                    aria-pressed={bySeq}
                    title={SEQ_HINT}
                    className={`${TOGGLE} flex items-center gap-1.5 ${bySeq ? TOGGLE_ON : TOGGLE_OFF}`}
                  >
                    <span aria-hidden="true" className="material-symbols-outlined text-lg">view_agenda</span>
                    <span>הצג ברצפים של {SEQ_SIZE}</span>
                    <span aria-hidden="true" className="material-symbols-outlined text-base text-on-surface/40">info</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 rounded-lg bg-surface p-1">
                <button type="button" onClick={() => setViewMode('single')} aria-pressed={viewMode === 'single'} className={`${VIEW_BTN} ${viewMode === 'single' ? VIEW_ON : TOGGLE_OFF}`} title="תצוגה רגילה">
                  <span aria-hidden="true" className="material-symbols-outlined">crop_portrait</span>
                </button>
                <button type="button" onClick={() => setViewMode('double')} aria-pressed={viewMode === 'double'} className={`${VIEW_BTN} ${viewMode === 'double' ? VIEW_ON : TOGGLE_OFF}`} title="תצוגה צפופה">
                  <span aria-hidden="true" className="material-symbols-outlined">auto_stories</span>
                </button>
              </div>
            </div>

            {bySeq && (
              <p className="-mt-3 mb-5 flex items-start gap-2 text-sm text-on-surface/60">
                <span aria-hidden="true" className="material-symbols-outlined text-base">tips_and_updates</span>
                {SEQ_HINT}
              </p>
            )}

            {visible.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-surface-variant bg-surface/30 py-16 text-center">
                <span aria-hidden="true" className="material-symbols-outlined mb-4 text-6xl text-on-surface/20">search_off</span>
                <p className="text-lg text-on-surface/60">
                  {data.pages.length === 0 ? 'אין עדיין עמודים בספר הזה' : 'אין עמודים שמתאימים לסינון'}
                </p>
                {data.pages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('all')
                      setOwnership('all')
                    }}
                    className="mt-6 rounded-lg border border-surface-variant bg-white px-6 py-2 font-medium text-primary transition-colors hover:bg-surface-variant"
                  >
                    נקה סינון
                  </button>
                )}
              </div>
            ) : bySeq ? (
              <div className="flex flex-col gap-4">
                {groups.map((g) => {
                  const cards = g.pages.filter((p) => visibleIds.has(p.id))
                  if (!cards.length) return null
                  return (
                    <ProofSequenceRow
                      key={g.key}
                      group={g}
                      canClaimNew={book.active}
                      busy={busy}
                      onClaimSequence={claimSequence}
                      gridClass={SEQ_GRID[viewMode]}
                    >
                      {cards.map(card)}
                    </ProofSequenceRow>
                  )
                })}
              </div>
            ) : (
              <div className={GRID[viewMode]}>{visible.map(card)}</div>
            )}
          </div>
        </div>
      </div>

      <ImagePreviewModal isOpen={!!preview} onClose={closePreview} imageSrc={preview} altText="תצוגת עמוד" />
    </>
  )
}
