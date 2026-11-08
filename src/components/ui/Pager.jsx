import Button from './Button'
import { cx } from './cx'

/**
 * מעבר בין עמודים ברשימה: "הקודם" · "עמוד 2 מתוך 13" · "הבא". בלי מספרי עמודים — ברשימת עבודה
 * עוברים לעמוד הבא, לא קופצים לעמוד 7; ובטלפון השורה נשארת קצרה. לא מוצג כשיש עמוד אחד.
 * הכיוון לפי RTL: "הקודם" בימין (חץ ימינה), "הבא" בשמאל.
 *
 * disabled — נעול לרגע (פעולה מרובה באמצע): הכפתורים נשארים בסדר הטאב (aria-disabled), כדי שהפוקוס לא ייפול.
 *
 * @param {{ page: number, pageCount: number, onChange: (page: number) => void, label?: string, className?: string, disabled?: boolean }} props
 */
export default function Pager({ page, pageCount, onChange, label = 'מעבר בין עמודים', className, disabled = false }) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label={label} className={cx('flex items-center justify-center gap-2', className)}>
      <Button variant="text" size="sm" icon="chevron_right" disabled={page <= 1} softDisabled={disabled} onClick={() => onChange(page - 1)}>
        הקודם
      </Button>
      <p className="min-w-28 text-center text-body-sm text-on-surface-variant tabular-nums">
        עמוד {page.toLocaleString('he-IL')} מתוך {pageCount.toLocaleString('he-IL')}
      </p>
      <Button variant="text" size="sm" iconEnd="chevron_left" disabled={page >= pageCount} softDisabled={disabled} onClick={() => onChange(page + 1)}>
        הבא
      </Button>
    </nav>
  )
}
