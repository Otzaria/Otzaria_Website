import { cx } from '@/components/ui/cx'

/**
 * נר הנצחה (בתוכנה: אייקון להבה): גוף נר דק, פתיל, ולהבה בזהב הקישוט (--color-glow) עם הילה
 * רכה (מטושטשת) שנושמת לאט (animate-ambient-pulse הקיים). ב-reduced-motion — ההילה נייחת.
 * דקורטיבי בלבד (aria-hidden): המשמעות בטקסט ההקדשה.
 * overflow-visible: הטשטוש של ההילה חורג מגבולות ה-viewBox — בלעדיו הוא נחתך למלבן.
 */
export default function CandleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 72" aria-hidden="true" focusable="false" className={cx('h-16 w-auto overflow-visible', className)}>
      <circle
        cx="24"
        cy="20"
        r="16"
        className="origin-center fill-glow opacity-40 blur-md [transform-box:fill-box] animate-ambient-pulse motion-reduce:animate-none"
      />
      {/* להבה: טיפה חיצונית בזהב, וליבה בהירה */}
      <path d="M24 6c5.5 7 8 11.2 8 15.2A8 8 0 0 1 16 21.2C16 17.2 18.5 13 24 6Z" className="fill-glow" />
      <path d="M24 14c2.6 3.4 3.8 5.6 3.8 7.6a3.8 3.8 0 0 1-7.6 0c0-2 1.2-4.2 3.8-7.6Z" className="fill-on-scrim opacity-75" />
      {/* פתיל וגוף הנר */}
      <path d="M24 29v4" className="stroke-on-surface-variant" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="17" y="33" width="14" height="33" rx="2.5" className="fill-surface-container-highest stroke-outline-variant" strokeWidth="1" />
      <path d="M12 66.5h24" className="stroke-outline-variant" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
