// prefers-reduced-motion לקוד JS שמחליט אם לנגן תנועה (הספר המוזהב, מעבר שם האתר, Dialog).
// ב-CSS — motion-reduce: / @media (ראו styles/motion.css); כאן רק מה ש-JS צריך לדעת מראש.

/** שאילתת המדיה — גם למי שצריך להאזין לשינוי (useWordmarkHandoff) */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * האם המבקר ביקש פחות תנועה.
 * fallback — התשובה כשאין window או matchMedia (שרת, jsdom ישן): false — לנגן כרגיל;
 *   true — לוותר על התנועה (Dialog: בלי matchMedia אין גם מי שיסיים את אנימציית היציאה).
 * win — לטסטים; ברירת המחדל — window של הדפדפן.
 */
export function prefersReducedMotion(fallback = false, win = typeof window === 'undefined' ? undefined : window) {
  if (!win || typeof win.matchMedia !== 'function') return fallback
  return win.matchMedia(REDUCED_MOTION_QUERY).matches
}
