import { cx } from '@/components/ui/cx'

/**
 * דוח הבדיקה כטקסט בלבד (pre-wrap, בלי HTML) — מגיע מפלט המודל ואינו מהימן. משותף לבעלים ולניהול.
 */
export default function ServiceReport({ decision, report, className }: {
  decision: 0 | 1 | null
  report: string
  className?: string
}) {
  const title = decision === 1 ? 'דוח הבדיקה — אושר' : decision === 0 ? 'דוח הבדיקה — נדחה' : 'דוח הבדיקה'
  return (
    <details className={cx('rounded-(--radius-control) border border-outline-variant p-3', className)} open={decision === 0}>
      <summary className="cursor-pointer text-label-lg text-on-surface">{title}</summary>
      <p dir="auto" className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-body-sm text-on-surface">
        {report}
      </p>
    </details>
  )
}
