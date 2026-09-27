'use client'

import { formatDateWithTime } from '@/lib/formatDate'

// תור ההגשות לפי מצב, עם מעבר לסקירה

const TABS = [
  { id: 'submitted', label: 'ממתינות לאישור' },
  { id: 'approved', label: 'מאושרות' },
  { id: 'rejected', label: 'נדחו' },
]

export default function SubmissionsQueue({ status, setStatus, gid, clearGid, data, page, setPage, onOpen }) {
  const counts = data?.counts || {}
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return (
    <div className="glass-strong rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setStatus(t.id)}
            className={`rounded-full px-3 py-1 text-sm ${status === t.id ? 'bg-primary text-on-primary' : 'bg-surface-variant/60 hover:bg-surface-variant'}`}
          >
            {t.label} ({counts[t.id] || 0})
          </button>
        ))}
        {gid && (
          <button onClick={clearGid} className="rounded-full bg-info-100 px-3 py-1 text-sm text-info-800">
            מסונן לספר אחד ✗
          </button>
        )}
      </div>
      {!data ? null : !data.items.length ? (
        <p className="py-4 text-center text-sm text-on-surface/60">אין הגשות</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-right text-on-surface/60">
            <tr>
              <th className="p-1">ספר · עמוד</th>
              <th className="p-1">מתייג</th>
              <th className="p-1">פעולות</th>
              <th className="p-1">הוגש</th>
              <th className="p-1"></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((s) => (
              <tr key={s.id} className="border-t border-surface-variant">
                <td className="p-1">
                  {s.title} · <b>{s.pageNo}</b>
                  {s.note && <div className="text-xs text-on-surface/60">«{s.note}»</div>}
                </td>
                <td className="p-1">{s.userName}</td>
                <td className="p-1 tabular-nums">{s.opCount}</td>
                <td className="p-1 text-xs">
                  {formatDateWithTime(s.createdAt)}
                  {s.reviewedByName && <div className="text-on-surface/50">נבדק: {s.reviewedByName}</div>}
                  {s.exportedAt && <div className="text-success-700">יצא בקובץ</div>}
                </td>
                <td className="p-1">
                  <button onClick={() => onOpen(s.id)} className="rounded-md bg-primary px-3 py-1 text-xs text-on-primary hover:opacity-90">
                    {status === 'submitted' ? 'סקירה' : 'צפייה'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded px-2 py-1 hover:bg-surface-variant disabled:opacity-40">הקודם</button>
          <span>{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded px-2 py-1 hover:bg-surface-variant disabled:opacity-40">הבא</button>
        </div>
      )}
    </div>
  )
}
