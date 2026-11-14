import { cx } from '@/components/ui/cx'

/**
 * קבוצת שדות בחלון (fieldset + legend גלוי) — כותרת title-sm ומרווח, בלי מסגרת וצל.
 * בטופסי החלונות של המקורות הפרטיים: "בעל הזכויות", "מי השיג את האישור", "אל מי פונים"…
 *
 * @param {{ legend: import('react').ReactNode, children: import('react').ReactNode, className?: string }} props
 */
export default function FormSection({ legend, children, className }) {
  return (
    <fieldset className={cx('min-w-0', className)}>
      <legend className="mb-3 text-title-sm text-on-surface">{legend}</legend>
      {children}
    </fieldset>
  )
}
