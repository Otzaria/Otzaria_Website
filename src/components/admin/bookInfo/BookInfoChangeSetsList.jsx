'use client'

import { useEffect, useState } from 'react'
import { BOOK_INFO_FIELD_LABELS, formatBookInfoValue } from './bookInfoDisplay'

const STATUS = {
  publishing: { label: 'בפתיחה', className: 'bg-neutral-cool-100 text-neutral-cool-700' },
  open: { label: 'ממתין למיזוג', className: 'bg-primary/10 text-primary' },
  conflict: { label: 'נדרשת בדיקה', className: 'bg-danger-100 text-danger-700' },
  modified: { label: 'נערך ידנית ב-GitHub', className: 'bg-warning-100 text-warning-800' },
  merged: { label: 'מוזג', className: 'bg-success-100 text-success-800' },
  closed: { label: 'נסגר', className: 'bg-neutral-cool-100 text-neutral-cool-700' },
  failed: { label: 'נכשל', className: 'bg-danger-100 text-danger-700' }
}


/**
 * עריכות מידע-על-ספרים שנפתחו כ-PR לריפו הספרייה. האישור עצמו הוא מיזוג ה-PR ב-GitHub;
 * הסטטוס כאן מתעדכן בסנכרון (/api/cron/book-info-sync).
 * @param {{refreshKey?: number}} props refreshKey משתנה כשנוספו PR-ים, כדי לטעון מחדש
 */
export default function BookInfoChangeSetsList({ refreshKey = 0 }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cursor, setCursor] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [activeOnly, setActiveOnly] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/admin/book-info/change-sets?active=${activeOnly}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'שגיאה בטעינת הבקשות')
        }
        if (!cancelled) { setRows(data.rows || []); setNextCursor(data.nextCursor || null) }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [refreshKey, activeOnly, cursor])

  const visibleRows = rows

  return (
    <section>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
        <h3 className="text-lg font-bold text-on-surface">בקשות שנפתחו ב-GitHub</h3>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activeOnly} onChange={(e) => { setActiveOnly(e.target.checked); setCursor(null) }} />
          רק בקשות פתוחות
        </label>
      </div>

      {error && <div className="mb-4 text-sm text-danger-700 bg-danger-50 border border-danger-200 px-3 py-2 rounded">{error}</div>}

      {loading ? (
        <div className="text-center py-10">טוען...</div>
      ) : visibleRows.length === 0 ? (
        <div className="text-center py-10 text-on-surface/60">{activeOnly ? 'אין בקשות פתוחות.' : 'עדיין לא נפתחו בקשות.'}</div>
      ) : (
        <div className="overflow-x-auto border border-surface-variant rounded-xl bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-surface/60 text-right">
                <th className="px-3 py-2">ספר</th>
                <th className="px-3 py-2">שינויים</th>
                <th className="px-3 py-2">הוצע על ידי</th>
                <th className="px-3 py-2">מצב</th>
                <th className="px-3 py-2">בקשה</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <ChangeSetRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex gap-3 mt-3">
        {cursor && <button onClick={() => setCursor(null)} className="text-primary underline">לעמוד הראשון</button>}
        {nextCursor && <button onClick={() => setCursor(nextCursor)} className="text-primary underline">לעמוד הבא</button>}
      </div>
    </section>
  )
}

function ChangeSetRow({ row }) {
  const status = STATUS[row.status] || STATUS.failed
  return (
    <tr className="border-t border-surface-variant/60 align-top">
      <td className="px-3 py-2">
        <div className="font-medium">{row.book}</div>
        {row.author && <div className="text-on-surface/60">{row.author}</div>}
      </td>
      <td className="px-3 py-2">
        <ul className="space-y-0.5">
          {Object.entries(row.changes).map(([field, value]) => (
            <li key={field}>
              <span className="text-on-surface/60">{BOOK_INFO_FIELD_LABELS[field] || field}:</span>{' '}
              <span className="text-primary font-medium">{formatBookInfoValue(value)}</span>
            </li>
          ))}
        </ul>
      </td>
      <td className="px-3 py-2">
        <div>{row.submittedBy || 'משתמש'}</div>
        <div className="text-on-surface/60">{new Date(row.createdAt).toLocaleString('he-IL')}</div>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${status.className}`}>{status.label}</span>
        {row.lastError && (
          <div className="mt-1 text-xs text-danger-700 max-w-xs break-words" title={row.lastError}>
            {row.lastError}
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {row.prUrl ? (
          <a href={row.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
            #{row.prNumber}
            <span className="material-symbols-outlined text-base">open_in_new</span>
          </a>
        ) : (
          '-'
        )}
      </td>
    </tr>
  )
}
