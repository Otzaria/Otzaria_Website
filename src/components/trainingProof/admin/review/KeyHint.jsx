import AppIcon from '@/components/ui/AppIcon'
import UiKbd from '@/components/ui/Kbd'

// מקש אחד בשורת-המקשים (ui/Kbd)
export function Kbd({ children }) {
  return <UiKbd keys={[children]} />
}

// שורת-המקשים בראש הסקירה. המקשים פועלים על השורה המסומנת (לחיצה על שורה בוחרת אותה),
// ולא בזמן הקלדה בשדה. במחשב בלבד — בטלפון אין מקלדת
export default function KeyHint({ children }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-body-sm text-on-surface-variant max-md:hidden" data-testid="tp-review-keys">
      <AppIcon name="keyboard" className="text-icon-md" />
      <span className="text-label-md">מקשים:</span> {children}
    </p>
  )
}
