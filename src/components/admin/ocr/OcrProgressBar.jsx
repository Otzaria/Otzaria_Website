/**
 * פס התקדמות נגיש (role="progressbar") עם שורת פירוט מתחתיו.
 * @param {{ percent: number, caption?: string, label?: string }} props
 */
export default function OcrProgressBar({ percent, caption, label = 'התקדמות' }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)))
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm text-on-surface-variant">
        <span>{label}</span>
        <span className="font-bold text-on-surface">{value}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-3 w-full overflow-hidden rounded-pill bg-surface-container-highest"
      >
        <div className="h-3 rounded-pill bg-success transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${value}%` }} />
      </div>
      {caption && <p className="mt-2 text-center text-xs text-on-surface-variant">{caption}</p>}
    </div>
  )
}
