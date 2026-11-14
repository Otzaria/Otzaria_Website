// צבע לכל כתב — אחיד בכל מסכי ההגהה לאימון (זיהוי, נתב, ניהול). ערכים מטוקני הצבע של
// האתר; הרכיבים קוראים להם דרך --tp-c (style), כך שאותה מחלקה מתאימה לכל כתב.
export const SCRIPT_COLOR = {
  square: 'var(--color-info-700)',
  rashi: 'var(--color-warning-strong-700)',
  latin: 'var(--color-success-700)',
  mixed: 'var(--color-feature-700)',
  neutral: 'var(--color-neutral-700)',
}

export const scriptStyle = (script) => ({ '--tp-c': SCRIPT_COLOR[script] || SCRIPT_COLOR.neutral })
