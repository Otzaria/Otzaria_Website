// מיקום תפריט הקשר (לחיצה ימנית) — לוגיקה טהורה (contextMenuGeometry.test.js).
// בימין-לשמאל התפריט נפתח משמאל לנקודת הלחיצה (הקצה הימני שלו בנקודה), כמו התפריט של הדפדפן;
// אם אין מקום — הוא מתהפך לצד השני, ובסוף נדחק פנימה כך שיישאר כולו בתוך המסך.

/**
 * @param {{
 *   x: number, y: number,                 נקודת הלחיצה (clientX / clientY)
 *   width: number, height: number,        מידות התפריט
 *   viewportWidth: number, viewportHeight: number,
 *   margin?: number,                      מרחק מינימלי משולי המסך
 *   rtl?: boolean
 * }} input
 * @returns {{ left: number, top: number }}
 */
export function contextMenuPosition({ x, y, width, height, viewportWidth, viewportHeight, margin = 8, rtl = true }) {
  const w = Math.max(0, Number(width) || 0)
  const h = Math.max(0, Number(height) || 0)
  const vw = Math.max(0, Number(viewportWidth) || 0)
  const vh = Math.max(0, Number(viewportHeight) || 0)
  const px = Number(x) || 0
  const py = Number(y) || 0

  const fitsStart = rtl ? px - w >= margin : px + w <= vw - margin
  const fitsEnd = rtl ? px + w <= vw - margin : px - w >= margin
  let left
  if (rtl) left = fitsStart || !fitsEnd ? px - w : px
  else left = fitsStart || !fitsEnd ? px : px - w

  // למטה מהנקודה; אם אין מקום — מעליה
  let top = py + h > vh - margin && py - h >= margin ? py - h : py

  left = clamp(left, margin, vw - w - margin)
  top = clamp(top, margin, vh - h - margin)
  return { left, top }
}

// תפריט גדול מהמסך — נצמד לשוליים ההתחלתיים (margin)
function clamp(value, min, max) {
  return Math.max(min, Math.min(value, Math.max(min, max)))
}
