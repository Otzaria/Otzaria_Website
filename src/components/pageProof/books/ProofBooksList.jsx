'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ProofProgressBar from './ProofProgressBar'
import { bookHref, bookMatches, scriptLabel, thumbUrl, CLAIM_HOURS, MAX_HELD } from '@/lib/pageProof/gridState'

// רשימת הספרים בהגהת-עמודים (/library/page-proof/books) — בנויה כמו הספרייה
// הישנה (/library/books): חיפוש, לשוניות-סינון, וכרטיס לכל ספר עם תמונת
// העמוד הראשון, שם, תווית, "סטטוס עמודים", פס-התקדמות ומונים. לחיצה על ספר
// ← רשת-העמודים שלו, ושם בוחרים עמוד או רצף.
//
// books — מ-GET /api/page-proof/books (null = עוד נטען); error — הודעה.

const FILTER_TABS = [
  { key: 'available', label: 'יש עמודים פנויים', icon: 'description' },
  { key: 'mine', label: 'העמודים שלי', icon: 'person' },
  { key: 'completed', label: 'הושלמו', icon: 'check_circle' },
]

const TAB = 'flex items-center gap-2 whitespace-nowrap rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all'
const TAB_ON = 'border-primary bg-primary text-on-primary'
const TAB_OFF = 'border-surface-variant bg-white text-on-surface hover:border-primary/50'

function BookThumbnail({ book }) {
  const [failed, setFailed] = useState(false)
  if (!book.firstPage || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface text-on-surface/20">
        <span aria-hidden="true" className="material-symbols-outlined text-3xl">auto_stories</span>
      </div>
    )
  }
  return (
    <img
      src={thumbUrl(book.firstPage)}
      alt={book.title}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  )
}

export function ProofBookCard({ book }) {
  const c = book.counts
  return (
    <Link
      href={bookHref(book.gid)}
      className="group flex h-full transform flex-col rounded-2xl border border-surface-variant bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg"
    >
      <div className="mb-5 flex gap-4">
        <div className="relative h-20 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-surface-variant shadow-sm transition-shadow group-hover:shadow-md">
          <BookThumbnail book={book} />
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <h3
            className="mb-2 line-clamp-2 font-frank text-lg font-bold leading-tight text-on-surface transition-colors group-hover:text-primary"
            title={book.title}
          >
            {book.title}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full border border-surface-variant/50 bg-surface px-2 py-0.5 text-xs font-bold text-black">
              {scriptLabel(book.script) || 'הגהת עמודים'}
            </span>
            {c.my > 0 && (
              <span
                className="inline-flex items-center rounded-full bg-info-100 px-2 py-0.5 text-xs font-bold text-info-800"
                title={`${c.mine} בטיפולך · ${c.submitted} הוגשו · ${c.approved} אושרו`}
              >
                העמודים שלי: {c.my}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto">
        <div className="mb-1.5 flex justify-between px-0.5 text-[11px] text-on-surface/50">
          <span>סטטוס עמודים</span>
          <span>{c.total.toLocaleString('he-IL')} סה"כ</span>
        </div>
        <ProofProgressBar counts={c} legend="dots" />
      </div>
    </Link>
  )
}

function HowItWorks({ mine }) {
  return (
    <div className="glass-strong flex h-full flex-col gap-3 rounded-2xl border border-surface-variant/30 p-5">
      <h2 className="flex items-center gap-2 font-bold text-on-surface">
        <span aria-hidden="true" className="material-symbols-outlined text-accent">tips_and_updates</span>
        איך זה עובד?
      </h2>
      <ol className="list-decimal space-y-1 pr-5 text-sm text-on-surface/70">
        <li>בוחרים ספר, ובו עמוד פנוי — או רצף של 5 עמודים עוקבים.</li>
        <li>
          העמוד נשמר עבורכם ל-{CLAIM_HOURS} שעות (עד {MAX_HELD} עמודים בבת אחת). מגיהים אותו בעורך ומגישים.
        </li>
        <li>מנהל בודק כל הגשה לפני שהיא נכנסת לספר.</li>
      </ol>
      {mine > 0 && (
        <p className="rounded-lg bg-info-50 px-3 py-2 text-sm font-medium text-info-800">
          יש לכם {mine === 1 ? 'עמוד אחד' : `${mine} עמודים`} בטיפול.
        </p>
      )}
      <Link
        href="/library/page-proof"
        className="mt-auto flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        title="המערכת תבחר עבורכם רצף של עד 5 עמודים עוקבים"
      >
        <span aria-hidden="true" className="material-symbols-outlined text-base">autorenew</span>
        או קבלו רצף אוטומטית
      </Link>
    </div>
  )
}

export default function ProofBooksList({ books, error = null }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('available')

  const list = useMemo(() => books || [], [books])
  const filtered = useMemo(() => list.filter((b) => bookMatches(b, { filter, search })), [list, filter, search])
  const myTotal = useMemo(() => list.reduce((sum, b) => sum + (b.counts?.mine || 0), 0), [list])

  return (
    <>
      <div className="flex flex-col items-stretch gap-6 lg:flex-row">
        <div className="flex flex-1 flex-col gap-6">
          <div>
            <h1 className="mb-2 font-frank text-4xl font-bold text-on-surface">הגהת עמודים</h1>
            <p className="text-lg text-on-surface/60">
              {books ? `${list.length} ספרים פתוחים להגהה — בחרו ספר, ובו עמוד או רצף` : 'בחרו ספר, ובו עמוד או רצף'}
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="חפש ספר..."
                aria-label="חיפוש ספר"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-2 border-surface-variant bg-white px-4 py-3 pr-10 shadow-sm transition-all focus:border-primary focus:outline-none"
              />
              <span aria-hidden="true" className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                search
              </span>
            </div>

            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 sm:pb-0">
              {FILTER_TABS.map((t) => (
                <button key={t.key} type="button" onClick={() => setFilter(t.key)} aria-pressed={filter === t.key} className={`${TAB} ${filter === t.key ? TAB_ON : TAB_OFF}`}>
                  <span aria-hidden="true" className="material-symbols-outlined text-lg">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
              <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'} className={`${TAB} ${filter === 'all' ? TAB_ON : TAB_OFF}`}>
                כל הספרים
              </button>
            </div>
          </div>
        </div>

        <div className="w-full flex-shrink-0 lg:w-[340px]">
          <HowItWorks mine={myTotal} />
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 p-4 text-danger-800">
          <span aria-hidden="true" className="material-symbols-outlined">error</span>
          {error}
        </div>
      ) : !books ? (
        <LoadingSpinner message="טוען את הספרים..." />
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-surface-variant pb-3">
            <span className="font-medium text-on-surface/70">נמצאו {filtered.length} ספרים</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-surface-variant bg-surface/30 py-20 text-center">
              <span aria-hidden="true" className="material-symbols-outlined mb-4 text-6xl text-on-surface/20">search_off</span>
              <p className="text-lg text-on-surface/60">
                {list.length === 0 ? 'אין כרגע ספרים פתוחים להגהה' : 'לא נמצאו ספרים התואמים את הסינון'}
              </p>
              {list.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setFilter('all')
                  }}
                  className="mt-6 rounded-lg border border-surface-variant bg-white px-6 py-2 font-medium text-primary transition-colors hover:bg-surface-variant"
                >
                  נקה סינון
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((b) => (
                <ProofBookCard key={b.gid} book={b} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
