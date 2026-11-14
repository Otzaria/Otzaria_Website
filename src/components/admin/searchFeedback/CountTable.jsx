import { cardClasses } from '@/components/ui/Card'
import { formatNumber } from '@/lib/adminTerms'

/** טבלת ספירה בלשונית "סיכום". rows: [{key, label, ltr?, count}] */
export default function CountTable({ title, rows, emptyText = 'אין נתונים' }) {
  return (
    <section className={cardClasses({ padding: 'md', className: 'flex flex-col gap-3' })} aria-label={title}>
      <h2 className="text-title-md text-on-surface">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">{emptyText}</p>
      ) : (
        <table className="w-full text-body-md">
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-outline-variant last:border-0">
                <td className="break-all py-2 pe-3">{r.ltr ? <bdi dir="ltr">{r.label}</bdi> : r.label}</td>
                <td className="w-24 py-2 text-end tabular-nums">{formatNumber(r.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
