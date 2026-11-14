import Link from 'next/link'
import { num, pagesPath, pct } from './labels'

// ההתקדמות לכל מסכת (overview.books): עמודים שהושלמו והחלטות נוסח שהוסכמו, עם קישור לרשת העמודים.

function Bar({ label, part, total, cls }) {
  const p = pct(part, total)
  return (
    <div className="flex items-center gap-2 text-xs text-on-surface/70">
      <span className="w-20 shrink-0">{label}</span>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-variant"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p}
      >
        <div className={`h-full ${cls}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-24 shrink-0 text-start tabular-nums">
        {num(part)} / {num(total)}
      </span>
    </div>
  )
}

export default function BookProgressList({ books }) {
  if (!books?.length) return <p className="text-on-surface/60">עדיין לא יובאו מסכתות לבדיקה.</p>
  const sorted = [...books].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {sorted.map((b) => (
        <li key={b.slug} className="rounded-xl border border-outline-variant bg-surface p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Link href={pagesPath(b.slug)} prefetch={false} className="font-bold text-on-surface hover:text-primary">
              {b.masechet}
            </Link>
            {b.itemsDisputed > 0 && <span className="text-xs text-on-surface/60">{num(b.itemsDisputed)} במחלוקת</span>}
          </div>
          <div className="flex flex-col gap-1">
            <Bar label="עמודים" part={b.pagesDone} total={b.pages} cls="bg-success-500" />
            <Bar label="החלטות" part={b.itemsAgreed} total={b.items} cls="bg-primary" />
          </div>
        </li>
      ))}
    </ul>
  )
}
