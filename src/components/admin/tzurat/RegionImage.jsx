'use client'

// תמונת עמוד (סריקה או שלנו) עם מסגרות מעליה — אזורים בשברים 0–1 מהתמונה ({x,y,w,h}).
// משמש בסקירת הגשה: אזורי הדיווחים, והשורות שהשתנו (לפי ours/scan של השורה במודל).

export const REGION_TONES = {
  report: 'border-region-report bg-region-report-fill',
  line: 'border-region-line bg-region-line-fill',
}

export default function RegionImage({ src, alt, boxes = [], className = '' }) {
  if (!src) return <p className="py-10 text-center text-xs text-on-surface/60">אין תמונה</p>
  return (
    <div className={`relative ${className}`}>
      <img src={src} alt={alt} loading="lazy" className="block h-auto w-full select-none" draggable={false} />
      {boxes.map((b, i) => (
        <span
          key={b.key || i}
          title={b.label}
          data-testid="region-box"
          className={`pointer-events-auto absolute border-2 ${REGION_TONES[b.tone] || REGION_TONES.report}`}
          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
        />
      ))}
    </div>
  )
}

/**
 * מקרא הצבעים של המסגרות — גלוי (ה-title של כל מסגרת קיים רק בריחוף, ולא בטלפון).
 * @param {{ tones: ('line' | 'report')[] }} props
 */
export function RegionLegend({ tones }) {
  const text = { line: 'שורות שהמתנדב שינה', report: 'אזורים שדווחו' }
  if (!tones.length) return null
  return (
    <ul aria-label="מקרא המסגרות בתמונות" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
      {tones.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <span aria-hidden="true" className={`inline-block size-4 shrink-0 rounded-sm border-2 ${REGION_TONES[t]}`} />
          {text[t]}
        </li>
      ))}
    </ul>
  )
}

/** [x,y,w,h] (מודל העמוד) → {x,y,w,h}, או null. */
export const arrBox = (a) => (Array.isArray(a) && a.length === 4 && a.every((v) => Number.isFinite(Number(v))) ? { x: +a[0], y: +a[1], w: +a[2], h: +a[3] } : null)
