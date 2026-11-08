import { cx } from './cx'

const TONES = {
  primary: 'bg-primary',
  success: 'bg-success',
}

/**
 * פס התקדמות (role="progressbar"): מסילה שקטה ומילוי. המספרים עצמם — בטקסט ליד הפס, אצל הקורא
 * (הפס מחזק אותם, לא מחליף). שם נגיש — label, או labelledBy של הטקסט שליד. valueText — מה שקורא
 * המסך אומר ("120 מתוך 340 עמודים"), במקום אחוז בלבד.
 * forced-colors: מסילה במסגרת ומילוי בצבע הטקסט — אחרת פס של רקע בלבד נעלם.
 *
 * @param {{ value: number, max: number, label?: string, labelledBy?: string, valueText?: string,
 *   tone?: 'primary' | 'success', size?: 'sm' | 'md', className?: string }} props
 */
export default function ProgressBar({ value, max, label, labelledBy, valueText, tone = 'primary', size = 'sm', className }) {
  const safeMax = max > 0 ? max : 0
  const safeValue = Math.min(Math.max(0, value || 0), safeMax)
  const percent = safeMax > 0 ? (safeValue / safeMax) * 100 : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-valuetext={valueText}
      className={cx(
        'w-full overflow-hidden rounded-(--radius-pill) bg-surface-container-high forced-colors:border forced-colors:border-[CanvasText]',
        size === 'md' ? 'h-2' : 'h-1.5',
        className
      )}
    >
      <div className={cx('h-full rounded-(--radius-pill) forced-colors:bg-[CanvasText]', TONES[tone])} style={{ width: `${percent}%` }} />
    </div>
  )
}
