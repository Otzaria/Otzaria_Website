import { cx } from '@/components/ui/cx'

/** רמות 1–3: המספר בעיגול, והגוון מתבהר עם העומק (רק תפקידי צבע). */
const LEVEL = {
  1: { row: 'bg-secondary-container text-on-secondary-container font-bold', dot: 'bg-primary text-on-primary', indent: '' },
  2: { row: 'bg-surface-container-high text-on-surface', dot: 'bg-secondary text-on-primary', indent: 'ms-6' },
  3: { row: 'bg-surface-container text-on-surface', dot: 'bg-on-surface-variant text-on-primary', indent: 'ms-12' }
} as const

export type HeadingLevelRow = { level: 1 | 2 | 3; label: string }

/**
 * דוגמה למבנה כותרות היררכי (מדריך דיקטה): כל שורה מוזחת לפי רמתה.
 * רשימה (ul); מספר הרמה גלוי ונקרא (לא רק ההזחה והצבע).
 */
export default function DocsHeadingLevels({ title, rows }: { title: string; rows: HeadingLevelRow[] }) {
  return (
    <div className="rounded-card bg-surface-container-low p-4 sm:p-5">
      <h3 className="mb-4 text-title-lg text-on-surface">{title}</h3>
      <ul className="space-y-2">
        {rows.map((row) => {
          const style = LEVEL[row.level]
          return (
            <li key={row.label} className={cx('flex items-center gap-3 rounded-control p-3', style.row, style.indent)}>
              <span
                className={cx('flex size-8 shrink-0 items-center justify-center rounded-pill text-label-md', style.dot)}
              >
                {row.level}
              </span>
              <span>{row.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
