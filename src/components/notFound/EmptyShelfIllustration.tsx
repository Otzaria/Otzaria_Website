import { cx } from '@/components/ui/cx'

/**
 * מדף ספרים ובו מקום ריק — האיור של דף 404. דקורטיבי בלבד (aria-hidden): המשמעות בכותרת.
 *
 * צבע: currentColor (ההורה קובע — text-primary), והספרים בגוונים שונים שלו דרך שקיפות,
 * כך שהאיור מתאים את עצמו לערכה הכהה בלי צבע קשיח. נקודת הזהב — הטוקן --color-glow, כמו
 * בקישוט הכותרת (TitleOrnament).
 *
 * תנועה: רק מסגרת המקום הריק "נושמת" (animate-pulse — דהייה בלבד, CSS), שלוש פעמים ונעצרת
 * (לא הבהוב מתמשך — WCAG 2.2.2), ובטלה לגמרי ב-prefers-reduced-motion.
 */
export default function EmptyShelfIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 132"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cx('h-auto w-full', className)}
    >
      {/* הספרים — מימין לשמאל, כמו מדף עברי */}
      <rect x="196" y="30" width="22" height="84" rx="3" fill="currentColor" fillOpacity="0.9" />
      <rect x="200" y="42" width="14" height="2" rx="1" fill="var(--color-glow)" />
      <rect x="200" y="100" width="14" height="2" rx="1" fill="var(--color-glow)" />

      <rect x="170" y="40" width="22" height="74" rx="3" fill="currentColor" fillOpacity="0.55" />

      <rect x="146" y="24" width="20" height="90" rx="3" fill="currentColor" fillOpacity="0.75" />
      <rect x="150" y="36" width="12" height="2" rx="1" fill="var(--color-glow)" />

      {/* המקום הריק */}
      <rect
        x="104"
        y="34"
        width="36"
        height="78"
        rx="4"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeDasharray="5 5"
        className="animate-pulse [animation-iteration-count:3] motion-reduce:animate-none"
      />
      <circle cx="122" cy="73" r="3.5" fill="var(--color-glow)" />

      <rect x="76" y="36" width="22" height="78" rx="3" fill="currentColor" fillOpacity="0.65" />

      {/* ספר נשען על השכן */}
      <g transform="rotate(-12 70 114)">
        <rect x="48" y="38" width="20" height="76" rx="3" fill="currentColor" fillOpacity="0.85" />
        <rect x="52" y="50" width="12" height="2" rx="1" fill="var(--color-glow)" />
      </g>

      <rect x="18" y="52" width="22" height="62" rx="3" fill="currentColor" fillOpacity="0.45" />

      {/* המדף */}
      <rect x="6" y="114" width="228" height="6" rx="3" fill="currentColor" fillOpacity="0.9" />
    </svg>
  )
}
