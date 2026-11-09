import Image from 'next/image'
import { cx } from '@/components/ui/cx'

/** גובה הלוגו לפי גודל הכרטיס (בפיקסלים — ל-next/image) */
const HEIGHT = { md: 48, lg: 64 } as const

/**
 * לוגו של מקור ספרים — כמו בתוכנה (_InfoChip):
 * - ברירת מחדל: הלוגו נצבע בצבע הטקסט (currentColor) — מסכת CSS על ה-SVG, כמו ui/AppIcon המותאם.
 *   כך הוא primary כשיש קישור ושקט כשאין, ומתחלף לבד בערכה הכהה.
 * - originalColor: הלוגו בצבעיו המקוריים, מעומעם מעט כדי שלא יבלוט מול השאר (בתוכנה 0.6);
 *   בריחוף על הכרטיס — מלא. בערכה הכהה על משטח בהיר, כי חלק מהלוגואים כהים.
 * ratio — רוחב/גובה; הרוחב מוגבל לרוחב הכרטיס, ו-contain שומר על היחס.
 */
export default function SourceLogo({ src, ratio, originalColor = false, size = 'md' }: {
  src: string
  ratio: number
  originalColor?: boolean
  size?: keyof typeof HEIGHT
}) {
  const height = HEIGHT[size]
  const box = size === 'lg' ? 'h-16' : 'h-12'
  if (originalColor) {
    return (
      <span className={cx('inline-flex max-w-full items-center justify-center dark:rounded-control dark:bg-on-surface dark:p-1.5')}>
        <Image
          src={src}
          alt=""
          width={Math.round(height * ratio)}
          height={height}
          className={cx(box, 'w-auto max-w-full object-contain opacity-60 transition-opacity group-hover:opacity-100 motion-reduce:transition-none')}
        />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cx(box, 'block max-w-full bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]')}
      style={{ aspectRatio: String(ratio), maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }}
    />
  )
}
