// תצוגת כוכבים לקריאה בלבד (הדירוג האינטראקטיבי — PluginRatingPanel).
//
// מלאכת המחצית: משתמשים בגליף 'star' היחיד שקיים בגופן האייקונים המוקטן
// (scripts/build-icon-font.mjs) בשתי שכבות — שכבת בסיס אפורה ומעליה שכבה
// צבועה שנחתכת ברוחב באחוזים. כך מוצג גם דירוג של 4.6 בלי אייקוני חצי-כוכב
// ובלי לגדיל את הגופן.

interface RatingStarsProps {
  /** הממוצע להצגה (0–5) */
  value: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-2xl'
} as const

export default function RatingStars({ value, size = 'md', className = '' }: RatingStarsProps) {
  const clamped = Math.min(Math.max(Number(value) || 0, 0), 5)
  const percent = (clamped / 5) * 100
  const sizeClass = SIZE_CLASSES[size]

  return (
    <span
      className={`relative inline-flex leading-none ${className}`}
      role="img"
      aria-label={`דירוג ${clamped.toLocaleString('he-IL', { maximumFractionDigits: 1 })} מתוך 5`}
    >
      {/* שכבת הבסיס — חמישה כוכבים אפורים */}
      <span className="inline-flex text-on-surface/20" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} className={`material-symbols-outlined ${sizeClass} leading-none`}>star</span>
        ))}
      </span>
      {/* שכבת המילוי — נחתכת לפי האחוז. inset-inline-start מתחיל בצד הקריאה
          (בעברית: מימין), כמו שמצפים בממשק RTL. */}
      <span
        className="absolute top-0 inline-flex overflow-hidden text-warning-500"
        style={{ insetInlineStart: 0, width: `${percent}%` }}
        aria-hidden="true"
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} className={`material-symbols-outlined ${sizeClass} leading-none`}>star</span>
        ))}
      </span>
    </span>
  )
}
