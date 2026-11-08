// לשונית "קטגוריות" במסך הספרים — לוגיקה טהורה: שורות העריכה, בדיקת תקינות, ומה צריך לקרות בשמירה.
//
// השרת שומר את רשימת הקטגוריות כולה בבת אחת (POST /api/admin/categories מחליף את כל הרשימה), והספרים
// מחזיקים את שם הקטגוריה כטקסט. לכן שינוי שם של קטגוריה שיש בה ספרים צריך גם להעביר את הספרים לשם
// החדש (עדכון לכל ספר) — אחרת הם נשארים עם שם שכבר לא קיים. מחיקת קטגוריה שיש בה ספרים — חסומה,
// ו"כללי" (ברירת המחדל של השרת לספר חדש) — אי אפשר לשנות לה שם או למחוק אותה.
import { DEFAULT_CATEGORY, PERSONAL_CATEGORY_PREFIX, booksCountText, displayCategory, formatNumber, isPersonal, safeColor } from './bookTerms.js'

/** הצבע של קטגוריה חדשה, ושל קטגוריה שהצבע שלה לא תקין */
export const DEFAULT_CATEGORY_COLOR = '#64748b'
const MAX_NAME_LENGTH = 60

// מפתחות השורות: לשורות מהשרת — לפי המיקום (זהה ברינדור השרת ובדפדפן; מונה גלובלי נתן מפתחות שונים
// ושגיאת hydration), ולשורות חדשות — מונה (נוצרות רק בדפדפן). קידומות שונות — בלי התנגשות.
let keySeq = 0
const nextKey = () => `n${++keySeq}`

/**
 * הקטגוריות מהשרת → שורות לעריכה. original — השם בשרת (null לשורה חדשה): כך יודעים מה שונה ומה נמחק.
 * @param {{ name: string, color?: string }[]} categories
 * @returns {{ key: string, original: string | null, name: string, color: string }[]}
 */
export function toCategoryRows(categories) {
  const seen = new Set()
  const rows = []
  for (const cat of categories || []) {
    const name = String(cat?.name ?? '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    rows.push({ key: `s${rows.length}`, original: name, name, color: safeColor(cat.color) ?? DEFAULT_CATEGORY_COLOR })
  }
  return rows
}

/** שורה חדשה (שם ריק — המשתמש כותב אותו) */
export function newCategoryRow() {
  return { key: nextKey(), original: null, name: '', color: DEFAULT_CATEGORY_COLOR }
}

/**
 * כמה ספרים בכל קטגוריה (לפי השם), בלי ספרים אישיים — להם אין קטגוריה אמיתית.
 * @returns {Map<string, string[]>} שם → מזהי הספרים
 */
export function booksByCategory(books) {
  const map = new Map()
  for (const book of books || []) {
    if (isPersonal(book)) continue
    const name = displayCategory(book)
    if (!name) continue
    if (!map.has(name)) map.set(name, [])
    map.get(name).push(book.id)
  }
  return map
}

/** למה אי אפשר לשנות את השם של "כללי" — גלוי בשורה שלה */
export const DEFAULT_CATEGORY_NOTE = 'ברירת המחדל לספרים חדשים — אי אפשר לשנות את השם שלה או למחוק אותה.'

/**
 * האם השם של השורה נעול: "כללי" — השרת נותן אותה לכל ספר חדש בלי קטגוריה, ושם אחר היה משאיר את
 * הספרים החדשים בקטגוריה שכבר לא בהגדרות; וכשהספרים לא נטענו (booksKnown=false) — שם של קטגוריה
 * קיימת, כי לא יודעים אילו ספרים צריך להעביר לשם החדש.
 * @returns {'default' | 'unknown-books' | null}
 */
export function nameLockReason(row, { booksKnown = true } = {}) {
  if (row.original === DEFAULT_CATEGORY) return 'default'
  if (!booksKnown && row.original) return 'unknown-books'
  return null
}

/**
 * מה יקרה בשמירה, ומה מונע אותה.
 * @param {{ key: string, original: string | null, name: string, color: string }[]} rows
 * @param {any[]} books
 * @param {{ booksKnown?: boolean }} [options] — booksKnown=false: הספרים לא נטענו (אין שינוי שם ואין מחיקה)
 * @returns {{ errors: { key: string | null, message: string }[], categories: { name: string, color: string }[],
 *   renames: { from: string, to: string, bookIds: string[] }[], removed: string[], changed: boolean }}
 */
export function planCategorySave(rows, initialRows, books, { booksKnown = true } = {}) {
  const errors = []
  const usage = booksByCategory(books)
  const names = new Map()
  rows.forEach((row) => {
    const name = row.name.trim()
    if (row.original && name !== row.original) {
      const lock = nameLockReason(row, { booksKnown })
      if (lock === 'default') errors.push({ key: row.key, message: `אי אפשר לשנות את השם של "${DEFAULT_CATEGORY}" — זו ברירת המחדל לספרים חדשים.` })
      if (lock === 'unknown-books') errors.push({ key: row.key, message: 'הספרים לא נטענו, ולכן אי אפשר לשנות שם של קטגוריה קיימת. רענן את הדף.' })
    }
    if (!name) {
      errors.push({ key: row.key, message: 'כתוב שם לקטגוריה, או מחק את השורה.' })
      return
    }
    if (name.length > MAX_NAME_LENGTH) errors.push({ key: row.key, message: `השם ארוך מדי (עד ${MAX_NAME_LENGTH} תווים).` })
    if (name.startsWith(PERSONAL_CATEGORY_PREFIX.trim())) errors.push({ key: row.key, message: 'שם שמתחיל ב"אישי" שמור לספרים אישיים.' })
    if (names.has(name)) errors.push({ key: row.key, message: `כבר יש קטגוריה בשם "${name}".` })
    else names.set(name, row.key)
  })

  const kept = new Set(rows.map((r) => r.original).filter(Boolean))
  const removed = initialRows.map((r) => r.original).filter((name) => name && !kept.has(name))
  for (const name of removed) {
    const count = usage.get(name)?.length || 0
    if (count > 0) errors.push({ key: null, message: `בקטגוריה "${name}" יש ספרים — אי אפשר למחוק אותה.` })
    else if (name === DEFAULT_CATEGORY) errors.push({ key: null, message: `אי אפשר למחוק את "${DEFAULT_CATEGORY}" — זו ברירת המחדל לספרים חדשים.` })
    else if (!booksKnown) errors.push({ key: null, message: 'הספרים לא נטענו, ולכן אי אפשר למחוק קטגוריות. רענן את הדף.' })
  }

  const renames = rows
    .filter((r) => r.original && r.name.trim() && r.original !== r.name.trim())
    .map((r) => ({ from: r.original, to: r.name.trim(), bookIds: usage.get(r.original) || [] }))

  const categories = rows
    .filter((r) => r.name.trim())
    .map((r) => ({ name: r.name.trim(), color: safeColor(r.color) ?? DEFAULT_CATEGORY_COLOR }))

  const before = JSON.stringify(initialRows.map((r) => [r.original, safeColor(r.color) ?? DEFAULT_CATEGORY_COLOR]))
  const after = JSON.stringify(rows.map((r) => [r.name.trim(), safeColor(r.color) ?? DEFAULT_CATEGORY_COLOR]))
  return { errors, categories, renames, removed, changed: before !== after }
}

/** האם אפשר למחוק את השורה: לא כשיש בקטגוריה (בשמה בשרת) ספרים, ולא את "כללי" — ברירת המחדל של השרת */
export function deleteBlockReason(row, usage) {
  if (row.original === DEFAULT_CATEGORY) return 'זו קטגוריית ברירת המחדל של ספרים חדשים.'
  const count = row.original ? usage.get(row.original)?.length || 0 : 0
  if (count > 0) return count === 1 ? 'יש בה ספר אחד. העבר אותו לקטגוריה אחרת קודם.' : `יש בה ${formatNumber(count)} ספרים. העבר אותם לקטגוריה אחרת קודם.`
  return null
}

/** "אין ספרים" / "ספר אחד" / "12 ספרים" — ליד כל קטגוריה */
export function categoryBooksText(count) {
  return count > 0 ? booksCountText(count) : 'אין ספרים'
}

/**
 * הספרים אחרי שחלק מהם הועברו לקטגוריה אחרת (שינוי שם) — כדי שהמספרים ליד הקטגוריות, ומה שמותר
 * למחוק, יהיו נכונים גם בלי לטעון מחדש. moved: מזהה ספר → הקטגוריה החדשה.
 * @param {any[]} books
 * @param {Map<string, string>} moved
 */
export function moveBooksLocally(books, moved) {
  if (!moved || moved.size === 0) return books
  return books.map((b) => (moved.has(b.id) ? { ...b, category: moved.get(b.id) } : b))
}

/**
 * ההודעה אחרי שמירת הקטגוריות. השמירה בשני שלבים: קודם הספרים עוברים לשם החדש, ורק אם כולם עברו —
 * נשמרת הרשימה (כך כשל באמצע לא משאיר ספרים בקטגוריה שכבר נמחקה מההגדרות). כשל באמצע — אומרים בדיוק
 * כמה עברו ושהרשימה לא נשמרה, ו"שמור" שוב ממשיך מאותו מקום.
 * @param {{ total: number, moved: number, listSaved: boolean }} result
 * @returns {{ tone: 'success' | 'error', message: string }}
 */
export function categorySaveResultText({ total, moved, listSaved }) {
  if (listSaved) {
    if (total === 0) return { tone: 'success', message: 'הקטגוריות נשמרו.' }
    return { tone: 'success', message: total === 1 ? 'הקטגוריות נשמרו, וספר אחד עבר לשם החדש.' : `הקטגוריות נשמרו, ו-${formatNumber(total)} ספרים עברו לשם החדש.` }
  }
  if (total === 0) return { tone: 'error', message: 'הקטגוריות לא נשמרו.' }
  return {
    tone: 'error',
    message: `${formatNumber(moved)} מתוך ${booksCountText(total)} עברו לשם החדש, והקטגוריות עוד לא נשמרו. לחץ "שמור" שוב כדי להמשיך מאותו מקום.`,
  }
}
