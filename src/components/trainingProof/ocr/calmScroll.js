// גלילה רגועה לשורה הנוכחית (בקשת מתנדבים: "הקפיצה לשורה הבאה קצת מפריע בעין").
// קודם: scrollIntoView למרכז בכל סימון — כל הרשימה זזה שורה שלמה גם כשהשורה הבאה כבר נראתה.
// עכשיו: לא זזים כל עוד השורה כולה נראית; כשלא — היא עולה תמיד לאותו מקום (מתחת לכותרת
// הדביקה, לפי scroll-margin-top של הכרטיס), בגלילה רכה, ובלי אנימציה למי שביקש פחות תנועה.

// כמה לגלול (בפיקסלים) כדי שהכרטיס ייראה כולו; 0 = הוא כבר נראה, לא זזים. טהור.
// top — הגובה שהכותרת הדביקה מסתירה (= המקום הקבוע שאליו עולה השורה), bottom — מרווח בתחתית
export function scrollDelta(rect, viewH, { top = 0, bottom = 16 } = {}) {
  if (rect.top >= top && rect.bottom <= viewH - bottom) return 0
  return Math.round(rect.top - top)
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// כמה מראש-החלון מסתירות הכותרות הדביקות כשהן נדבקו: ה-top שלהן ועוד הגובה (בטלפון הן גבוהות יותר)
export function stickyInset(els) {
  let inset = 0
  for (const el of els) {
    if (!el) continue
    const cs = window.getComputedStyle(el)
    if (cs.position !== 'sticky' && cs.position !== 'fixed') continue
    inset = Math.max(inset, (parseFloat(cs.top) || 0) + el.getBoundingClientRect().height)
  }
  return inset
}

// stickies — הכותרות הדביקות שמעל הרשימה; המקום הקבוע = מתחתן (ולפחות scroll-margin-top של הכרטיס)
export function revealCard(el, { stickies = [] } = {}) {
  if (!el || typeof window === 'undefined') return
  const top = Math.max(parseFloat(window.getComputedStyle(el).scrollMarginTop) || 0, stickyInset(stickies) + 12)
  const d = scrollDelta(el.getBoundingClientRect(), window.innerHeight, { top })
  if (d) window.scrollBy({ top: d, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}
