// מיקום התמונה בתוך מסגרת החיתוך של PageScanCrop (טהור). המסגרת ביחס הרוחב-גובה של האזור
// בפיקסלים; התמונה כולה מוגדלת כך שהאזור ממלא את המסגרת, ומוזזת אחורה (left/top שליליים).

/** יחס משוער עד שגודל התמונה ידוע (שורה–שתיים בעמוד רגיל) */
export const FALLBACK_ASPECT = 8

const pct = (n) => `${Math.round(n * 100000) / 1000}%`

/**
 * @param {{ x: number, y: number, w: number, h: number, mark?: { x: number, y: number, w: number, h: number }|null }} rect
 *   האזור בשברים (0..1) מגודל התמונה
 * @param {{ w: number, h: number }|null} natural הגודל הטבעי של התמונה — null עד שנטענה
 * @returns {{ aspect: number, image: Record<string, string>, mark: Record<string, string>|null }}
 */
export function cropLayout(rect, natural) {
  const ratio = natural && natural.w > 0 && natural.h > 0 ? (rect.w * natural.w) / (rect.h * natural.h) : FALLBACK_ASPECT
  const aspect = Math.round(Math.min(40, Math.max(0.25, ratio)) * 1000) / 1000
  const image = {
    width: pct(1 / rect.w),
    height: pct(1 / rect.h),
    left: pct(-rect.x / rect.w),
    top: pct(-rect.y / rect.h),
  }
  const m = rect.mark
  const mark = m
    ? { left: pct((m.x - rect.x) / rect.w), top: pct((m.y - rect.y) / rect.h), width: pct(m.w / rect.w), height: pct(m.h / rect.h) }
    : null
  return { aspect, image, mark }
}
