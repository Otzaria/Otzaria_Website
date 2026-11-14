import { SECTIONS, SECTION_LABELS } from '@/lib/trainingProof/vocab'

const fmt = (n) => (Number.isFinite(n) ? n.toLocaleString('he-IL') : '0')
const UNIT = { ocr: 'שורות', router: 'שורות', frames: 'עמודים' }

// "ההגהות שלי" — לפי סוג ההגהה ולא מספר אחד (ה-3)
export default function MyStats({ stats }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-(--card-bg) p-5">
      <h2 className="text-title-lg font-bold text-on-surface">ההגהות שלי</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body-md">
          <thead>
            <tr className="border-b border-outline-variant text-start text-label-md text-on-surface-variant">
              <th className="px-2 py-1.5 text-start font-semibold">סוג ההגהה</th>
              <th className="px-2 py-1.5 text-start font-semibold">שמרתי</th>
              <th className="px-2 py-1.5 text-start font-semibold">ממתינות לאישור</th>
              <th className="px-2 py-1.5 text-start font-semibold">אושרו ונכנסו לאימון</th>
              <th className="px-2 py-1.5 text-start font-semibold">נדחו</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {SECTIONS.map((s) => {
              const r = stats?.[s] || {}
              return (
                <tr key={s} className="border-b border-outline-variant/60 last:border-0">
                  <td className="px-2 py-2">
                    <b>{SECTION_LABELS[s]}</b> <span className="text-label-sm text-on-surface-variant">({UNIT[s]})</span>
                  </td>
                  <td className="px-2 py-2">{fmt(r.saved)}</td>
                  <td className="px-2 py-2">{fmt(r.pending)}</td>
                  <td className="px-2 py-2 text-success">{fmt(r.approved)}</td>
                  <td className="px-2 py-2 text-error">{fmt(r.rejected)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
