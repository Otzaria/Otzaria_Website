'use client'

/** טבלת ספירה פשוטה. rows: [{key, label, ltr?, count}] */
export default function CountTable({ title, rows, emptyText = 'אין נתונים' }) {
  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="mb-3 text-lg font-bold text-on-surface">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface/60">{emptyText}</p>
      ) : (
        <table className="w-full text-right text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-surface-variant/50 last:border-0">
                <td className="py-2 break-all" dir={r.ltr ? 'ltr' : undefined}>{r.label}</td>
                <td className="py-2 w-24 font-bold">{r.count.toLocaleString('he-IL')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
