import { cx } from '@/components/ui/cx'

/**
 * קטגוריה: נקודת צבע עדינה (הצבע מהשרת, אחרי safeColor) ושם בטקסט רגיל — הטקסט נשאר בצבע הטוקן,
 * בניגודיות מלאה, גם כשהצבע בהיר מאוד או צעקני. הנקודה דקורטיבית (השם כתוב), עם טבעת דקה כדי
 * שצבע בהיר ייראה על הרקע; ב-forced-colors נעלמת.
 * @param {{ name: string, color?: string | null, className?: string }} props
 */
export default function CategoryLabel({ name, color, className }) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full bg-outline-variant ring-1 ring-on-surface/20 ring-inset forced-colors:hidden"
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="truncate">{name}</span>
    </span>
  )
}
