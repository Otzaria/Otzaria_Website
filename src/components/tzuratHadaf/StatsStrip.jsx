import { num } from './labels'

// פס המונים של המסלול המהיר: כמה שאלות פתוחות, כמה עניתם, וכמה מהן כבר הוסכמו.
// stats — {open, mine, mineAgreed} (CONTRACT: GET fast)
export default function StatsStrip({ stats }) {
  if (!stats) return null
  const cells = [
    { key: 'open', label: 'שאלות פתוחות', value: stats.open, cls: 'bg-info-100 text-info-800' },
    { key: 'mine', label: 'עניתם', value: stats.mine, cls: 'bg-primary-container text-on-surface' },
    { key: 'agreed', label: 'הוסכמו מתשובותיכם', value: stats.mineAgreed, cls: 'bg-success-100 text-success-800' },
  ]
  return (
    <ul className="flex flex-wrap gap-2" aria-label="מונים">
      {cells.map((c) => (
        <li key={c.key} className={`rounded-full px-3 py-1.5 text-sm font-bold ${c.cls}`}>
          {c.label}: <span data-testid={`stat-${c.key}`}>{num(c.value)}</span>
        </li>
      ))}
    </ul>
  )
}
