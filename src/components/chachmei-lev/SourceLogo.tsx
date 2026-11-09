import { cx } from '@/components/ui/cx'

/** גובה הראייה של הלוגו — אחיד לכל הלוגואים באותו גודל כרטיס, כך שקיר הלוגואים נראה כשורה אחת */
const BOX = { md: 'h-10', lg: 'h-14 sm:h-16' } as const

/**
 * לוגו של מקור ספרים: תמיד נצבע בצבע הטקסט (currentColor) — מסכת CSS על הקובץ, כמו ui/AppIcon
 * המותאם. כך כל הקיר בצבע אחד: primary כשיש קישור ושקט כשאין, ומתחלף לבד בערכה הכהה.
 * (השדה originalColor שבנתונים — מהתוכנה — אינו משמש בתצוגה: לוגואים צבעוניים שבלטו מול השאר.)
 * ratio — רוחב/גובה; הרוחב מוגבל לרוחב הכרטיס, ו-contain שומר על היחס.
 */
export default function SourceLogo({ src, ratio, size = 'md' }: {
  src: string
  ratio: number
  size?: keyof typeof BOX
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(BOX[size], 'block max-w-full bg-current [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]')}
      style={{ aspectRatio: String(ratio), maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }}
    />
  )
}
