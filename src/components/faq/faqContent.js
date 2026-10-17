// לוגיקה טהורה של דף השאלות הנפוצות (בלי React ובלי DOM): קיבוץ לפי קטגוריה, עוגן לכל שאלה,
// ופירוק טקסט לקטעים עבריים ולועזיים לבידוד כיווניות. הנתונים עצמם — src/lib/faq-data.js.

/** הקטגוריה המיוחדת "הכל" ברשימת הסינון */
export const ALL_CATEGORY = 'all'

/** העוגן של שאלה (id ב-DOM): /faq#faq-7 פותח את שאלה 7 */
export function faqAnchorId(faqId) {
  return `faq-${faqId}`
}

/** ה-id של כותרת קטגוריה (aria-labelledby של האזור שלה) */
export function categoryHeadingId(categoryId) {
  return `faq-category-${categoryId}`
}

/**
 * השאלות מקובצות לפי קטגוריה, בסדר רשימת הקטגוריות (בלי "הכל"); בכל קבוצה — סדר השאלות במקור.
 * active — הקטגוריה שנבחרה בסינון ("all" — כולן). קטגוריה בלי שאלות לא מוחזרת.
 */
export function groupFaqs(faqs, categories, active = ALL_CATEGORY) {
  return categories
    .filter((category) => category.id !== ALL_CATEGORY && (active === ALL_CATEGORY || category.id === active))
    .map((category) => ({ category, items: faqs.filter((faq) => faq.category === category.id) }))
    .filter((group) => group.items.length > 0)
}

/** השאלה שהעוגן בכתובת מצביע עליה ("#faq-7"), או null */
export function findFaqByHash(hash, faqs) {
  const match = /^#?faq-(\d+)$/.exec(String(hash ?? '').trim())
  if (!match) return null
  const id = Number(match[1])
  return faqs.find((faq) => faq.id === id) ?? null
}

// רצף לועזי: מתחיל באות לטינית, ממשיך בתווים לועזיים (אותיות, ספרות, רווח, + . _ / -).
// "iPhone / iPad", "Visual C++ Redistributable", "sudo apt-get install libgtk-3-0".
// (מחלקת תווים אחת עם רווח, ולא מילים חוזרות — בלי כמת מקונן, security/detect-unsafe-regex)
const LATIN_RUN = /[A-Za-z][A-Za-z0-9+._/ -]*/g
// רווח ופיסוק בסוף הרצף שייכים למשפט העברי ("run-otzaria.sh." — הנקודה מסיימת את המשפט)
const TRAILING_PUNCT = /[ ._/-]+$/

/**
 * מפרק טקסט לקטעים: { text, ltr }. קטע ltr יוצג בבידוד (bdi dir="ltr"), אחרת בפסקה RTL
 * הסוגריים והפיסוק סביב מונח לועזי מתהפכים ("(Web)?"). חיבור כל הקטעים מחזיר את הטקסט המקורי
 * בדיוק — הנוסח לא משתנה, רק הכיווניות.
 */
export function splitLatinRuns(text) {
  const source = String(text ?? '')
  const parts = []
  let last = 0
  for (const match of source.matchAll(LATIN_RUN)) {
    const run = match[0].replace(TRAILING_PUNCT, '')
    const start = match.index
    if (start > last) parts.push({ text: source.slice(last, start), ltr: false })
    parts.push({ text: run, ltr: true })
    last = start + run.length
  }
  if (last < source.length) parts.push({ text: source.slice(last), ltr: false })
  return parts
}
