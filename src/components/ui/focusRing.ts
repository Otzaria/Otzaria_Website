/**
 * טבעת הפוקוס האחידה של כל רכיב אינטראקטיבי — 2px בצבע --color-focus-ring, במרחק 2px.
 * (קובצי CSS כמו nav.css / effects.css משתמשים באותם ערכים דרך --focus-ring-* ב-component-tokens.css.)
 * INSET — לפריט שצמוד לקצה של מכל עם overflow (כפתור הסגירה בדיאלוג, פריט ברשימה).
 */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

export const FOCUS_RING_INSET =
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring'
