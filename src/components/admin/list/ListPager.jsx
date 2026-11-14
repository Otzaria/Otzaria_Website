import Pager from '@/components/ui/Pager'
import { formatNumber } from '@/lib/adminTerms'

/**
 * העימוד מתחת לרשימה בכל מסכי הניהול: "הקודם · עמוד 2 מתוך 4 · הבא", ומתחת "26–50 מתוך 77". עמוד אחד — כלום.
 * prefix — מילה לפני הטווח ("ספרים 26–50 מתוך 77"). disabled — נעול לרגע (פעולה מרובה באמצע; ראו ui/Pager).
 * @param {{ page: { page: number, pageCount: number, from: number, to: number, total: number }, onChange: (page: number) => void,
 *   prefix?: string, disabled?: boolean }} props
 */
export default function ListPager({ page, onChange, prefix, disabled = false }) {
  if (page.pageCount <= 1) return null
  return (
    <div className="flex flex-col items-center gap-1">
      <Pager page={page.page} pageCount={page.pageCount} onChange={onChange} label="מעבר בין עמודי הרשימה" disabled={disabled} />
      <p className="text-body-sm tabular-nums text-on-surface-variant">
        {prefix ? `${prefix} ` : ''}{formatNumber(page.from)}–{formatNumber(page.to)} מתוך {formatNumber(page.total)}
      </p>
    </div>
  )
}
