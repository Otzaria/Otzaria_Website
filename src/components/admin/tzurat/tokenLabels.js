// צורת הדף — מפתחות API (`tht_`) בממשק: ההיקפים בעברית, תקרות וברירות מחדל (כמו בהגהת עמודים;
// השרת הוא שאוכף — כאן רק לתצוגה ולבדיקת הטופס).

export const SCOPES = Object.freeze(['read', 'review', 'import'])
export const SCOPE_LABELS = Object.freeze({
  read: 'קריאה — סקירה, מחלוקות, הגשות, דיווחים וייצוא',
  review: 'הכרעה — הכרעת מחלוקות, אישור ודחיית הגשות, טיפול בדיווחים',
  import: 'ייבוא — העלאת חבילות וסנכרון מצורת הדף',
})
export const SCOPE_SHORT = Object.freeze({ read: 'קריאה', review: 'הכרעה', import: 'ייבוא' })

export const MAX_NAME = 60
export const DEFAULT_DAYS = 180
export const MAX_DAYS = 365
export const MAX_ACTIVE = 5

/** מספר ימים שלם 1–MAX_DAYS, או null. */
export function validDays(value) {
  const s = String(value ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return n >= 1 && n <= MAX_DAYS ? n : null
}
