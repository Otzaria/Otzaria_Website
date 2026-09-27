'use client'

import { formatDateShort } from '@/lib/formatDate'

// טבלת הספרים בהגהת-העמודים: התקדמות, השהיה, והורדת תיקונים.json לבעל
// הפרויקט (חדשים / הכול / כפולים-למדידת-הסכמה).

const btn = 'rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-40 hover:bg-surface-variant'

export default function BooksTable({ books, busy, onDownload, onToggle, onDelete, onFilter }) {
  if (!books.length) {
    return <div className="glass-strong rounded-xl p-6 text-center text-on-surface/60">עוד לא יובאו ספרים</div>
  }
  return (
    <div className="glass-strong overflow-x-auto rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-surface-variant/50 text-right">
          <tr>
            <th className="p-2">ספר</th>
            <th className="p-2">עמודים</th>
            <th className="p-2" title="עמודים שכל ההגשות הנדרשות להם הוגשו">הושלמו</th>
            <th className="p-2">ממתינות</th>
            <th className="p-2">אושרו</th>
            <th className="p-2" title="מאושרות שעוד לא יצאו בקובץ-תיקונים">לייצוא</th>
            <th className="p-2">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {books.map((b) => (
            <tr key={b.gid} className="border-t border-surface-variant align-top">
              <td className="p-2">
                <div className="font-bold">{b.title}</div>
                <div className="text-xs text-on-surface/50">
                  {b.script === 'rashi' ? 'רש"י' : b.script === 'square' ? 'מרובע' : b.script || ''} · {b.lineCount.toLocaleString('he-IL')} שורות · כפולים {b.doublePct}%
                  {b.lastImportAt && ` · יובא ${formatDateShort(b.lastImportAt)}`}
                </div>
                <div className="text-[10px] text-on-surface/40" dir="ltr">{b.gid}</div>
                {b.status === 'paused' && <span className="rounded bg-warning-alt-100 px-1.5 text-xs text-warning-alt-800">מושהה</span>}
              </td>
              <td className="p-2 tabular-nums">
                {b.pageCount}
                {b.double > 0 && <div className="text-xs text-on-surface/50">{b.double} כפולים</div>}
                {b.leased > 0 && <div className="text-xs text-on-surface/50">{b.leased} בעבודה</div>}
              </td>
              <td className="p-2 tabular-nums">{b.done}</td>
              <td className="p-2 tabular-nums">
                {b.submitted > 0 ? (
                  <button className="font-bold text-info-700 hover:underline" onClick={() => onFilter(b.gid)}>{b.submitted}</button>
                ) : (
                  0
                )}
              </td>
              <td className="p-2 tabular-nums">{b.approved}</td>
              <td className="p-2 tabular-nums">{b.unexported}</td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  <button disabled={busy || !b.unexported} onClick={() => onDownload(b, { set: 'primary', onlyNew: true, mark: true })} className={`${btn} bg-success-100 text-success-800`} title="רק מה שעוד לא יצא, ומסמן כיצא">
                    תיקונים חדשים
                  </button>
                  <button disabled={busy || !b.approved} onClick={() => onDownload(b, { set: 'primary' })} className={btn} title="כל המאושרות (הגשה אחת לעמוד), בלי לסמן">
                    הכול
                  </button>
                  {b.double > 0 && (
                    <button disabled={busy || !b.approved} onClick={() => onDownload(b, { set: 'double' })} className={btn} title="ההגשות השניות של העמודים הכפולים — למדידת הסכמה">
                      כפולים
                    </button>
                  )}
                  <button disabled={busy} onClick={() => onToggle(b)} className={btn}>
                    {b.status === 'paused' ? 'חידוש' : 'השהיה'}
                  </button>
                  <button disabled={busy} onClick={() => onDelete(b)} className={`${btn} text-danger-700`}>
                    מחיקה
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
