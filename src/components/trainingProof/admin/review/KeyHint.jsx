import Kbd from '../../common/Kbd'

export { Kbd }

// שורת-המקשים בראש הסקירה. המקשים פועלים על השורה המסומנת (לחיצה על שורה בוחרת אותה),
// ולא בזמן הקלדה בשדה
export default function KeyHint({ children }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs leading-6 text-on-surface/70" data-testid="tp-review-keys">
      <span className="material-symbols-outlined text-base">keyboard</span>
      <b>מקשים:</b> {children}
    </p>
  )
}
