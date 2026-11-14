'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { AccessNotice } from './TzuratShell'
import { api } from './api'
import { REPORT_STATUS, SUBMISSION_STATUS, categoryLabel, num, reviewPath } from './labels'

// "התרומות שלי": נקודות, מוני ההחלטות, ההגשות שלי עם המצב והערת המנהל, והדיווחים שלי עם המצב והטיפול.
// CONTRACT: GET /api/tzurat-hadaf/mine.

const fmtDate = (at) => {
  if (!at) return ''
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL')
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-surface-variant/50 p-3 text-center">
      <dt className="text-xs text-on-surface/60">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums text-on-surface">{num(value)}</dd>
    </div>
  )
}

export default function MineView() {
  const [data, setData] = useState(null)
  const [fail, setFail] = useState(null)

  useEffect(() => {
    let alive = true
    api.mine().then((r) => {
      if (!alive) return
      if (r.ok) setData(r.data)
      else setFail({ status: r.status, error: r.error })
    })
    return () => {
      alive = false
    }
  }, [])

  if (fail) return <AccessNotice status={fail.status} error={fail.error} />
  if (!data) return <p className="text-on-surface/60" role="status">טוען...</p>
  const d = data.decisions || {}

  return (
    <div className="flex flex-col gap-5">
      <section className="glass-strong rounded-2xl p-5" aria-label="מונים">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="נקודות" value={data.points} />
          <Stat label="החלטות נוסח" value={d.total} />
          <Stat label="הוסכמו" value={d.agreed} />
          <Stat label="במחלוקת" value={d.disputed} />
          <Stat label="עוד פתוחות" value={d.open} />
        </dl>
      </section>

      <section className="glass-strong flex flex-col gap-3 rounded-2xl p-5" aria-labelledby="th-my-pages">
        <h2 id="th-my-pages" className="text-xl font-bold text-on-surface">
          העמודים שהגשתי
        </h2>
        {!data.pages?.length ? (
          <p className="text-on-surface/60">עדיין לא הגשתם עמודים.</p>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {data.pages.map((p) => {
              const st = SUBMISSION_STATUS[p.status] || { label: p.status, tone: 'neutral' }
              return (
                <li key={`${p.id}-${p.at}`} className="flex flex-wrap items-start gap-2 py-2">
                  <Link href={reviewPath(p.id)} prefetch={false} className="font-bold text-on-surface hover:text-primary">
                    {p.masechet} {p.daf}
                  </Link>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className="text-sm text-on-surface/60">{fmtDate(p.at)}</span>
                  {p.reviewNote && <p className="w-full text-sm text-on-surface/80">הערת המנהל: {p.reviewNote}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="glass-strong flex flex-col gap-3 rounded-2xl p-5" aria-labelledby="th-my-reports">
        <h2 id="th-my-reports" className="text-xl font-bold text-on-surface">
          הדיווחים שלי
        </h2>
        {!data.reports?.length ? (
          <p className="text-on-surface/60">עדיין לא שלחתם דיווחים.</p>
        ) : (
          <ul className="divide-y divide-outline-variant">
            {data.reports.map((r) => {
              const st = REPORT_STATUS[r.status] || { label: r.status, tone: 'neutral' }
              const note = typeof r.resolution === 'string' ? r.resolution : r.resolution?.note
              return (
                <li key={r.id} className="flex flex-wrap items-start gap-2 py-2">
                  <span className="font-bold text-on-surface">
                    {r.masechet} {r.daf}
                  </span>
                  <Badge>{categoryLabel(r.category)}</Badge>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className="text-sm text-on-surface/60">{fmtDate(r.at)}</span>
                  {r.text && <p className="w-full text-sm text-on-surface/80">{r.text}</p>}
                  {note && <p className="w-full text-sm text-success-800">הטיפול: {note}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
