// קיבוץ ההעלאות לפי ספר — לוגיקה טהורה, משותפת ללשונית "העלאות" וללשונית "אשפה".
//
// שם ההעלאה (bookName) מגיע בכמה צורות, לפי המקום שממנו נשלחה:
//   "חוות-דעת - עמוד 40"            — עמוד שנערך באתר (שם הספר בכתובת + מספר העמוד)
//   "חוות דעת_page_96"               — עמוד מהמערכת הישנה
//   "u-0341-יעבץ-על-תהילים - עמוד 3" — עמוד מספר אישי שמשתמש העלה (u-<4 תווים>-)
//   "אסופות ומאמרים"                 — ספר שלם
//   "תלמוד בבלי/אחרונים/בית מאיר שס"  — ספר מדיקטה (נתיב)
// מפתח הקבוצה מנורמל (normalizeHebrew): מקף, קו תחתון ורווח שווים, וגרשיים לא משנים — כך
// "חוות-דעת" ו"חוות דעת" נכנסים לאותה קבוצה. הקיבוץ הישן (ביטוי רגולרי בכל אחד משני הדפים)
// הבחין ביניהם, ולכן אותו ספר הופיע פעמיים.
import { normalizeHebrew } from '../hebrewSearchNormalize.js'

// סיומת עמוד: מפריד (רווח / מקף / קו תחתון), "עמוד" או "page", ומספר — בסוף השם.
// דורש מפריד לפני המילה, כדי ש"homepage 5" לא ייחתך באמצע מילה.
const PAGE_SUFFIX = /[\s_\-–]+(?:עמוד|page)[\s_]*(\d+)[\s_]*$/i
// גרסה ישנה ששמורה לפני שהספר הוחלף: "... (גרסה ישנה מ-2026-03-12T15-05-52-594Z)" — לפעמים בלי
// הסוגר. בלי הטיפול בה כל גרסה ישנה הייתה ספר נפרד (באשפה — כמעט כולן).
const OLD_VERSION = /\(גרסה ישנה[^()]*\)?$/
// ספר אישי של משתמש (src/app/api/user/upload/route.js): u-<4 התווים האחרונים של מזהה המשתמש>-
const PERSONAL_PREFIX = /^u-[0-9a-f]{4}-/i

/**
 * מפרק שם העלאה לשם הספר, למספר העמוד (אם יש), ולסימון "גרסה ישנה" (אם יש).
 * @param {string | null | undefined} name
 * @returns {{ base: string, page: number | null, oldVersion: boolean }}
 */
export function parseUploadName(name) {
  const raw = String(name ?? '')
  const cached = parsedNames.get(raw)
  if (cached) return cached
  const parsed = Object.freeze(parseUploadNameUncached(raw))
  // מטמון לפי השם: הקיבוץ רץ מחדש בכל שינוי ברשימה (מחיקה, שינוי מצב), על אלפי העלאות
  if (parsedNames.size > 20000) parsedNames.clear()
  parsedNames.set(raw, parsed)
  return parsed
}

/** @type {Map<string, { base: string, page: number | null, oldVersion: boolean }>} */
const parsedNames = new Map()

function parseUploadNameUncached(name) {
  let text = name.trim()
  const version = OLD_VERSION.exec(text)
  const oldVersion = Boolean(version && version.index > 0)
  if (oldVersion) text = text.slice(0, version.index).trim()
  const match = PAGE_SUFFIX.exec(text)
  if (!match || match.index === 0) return { base: text, page: null, oldVersion }
  return { base: text.slice(0, match.index).trim(), page: Number(match[1]), oldVersion }
}

/** מפתח הקבוצה של שם ספר — מנורמל, כדי שווריאציות כתיב של אותו ספר יתקבצו יחד */
export function bookGroupKey(base) {
  const raw = String(base ?? '')
  let key = groupKeys.get(raw)
  if (key === undefined) {
    key = normalizeHebrew(raw) || raw.trim()
    if (groupKeys.size > 20000) groupKeys.clear()
    groupKeys.set(raw, key)
  }
  return key
}
const groupKeys = new Map()

/**
 * שם הספר לתצוגה: נתיב (דיקטה) — הקטע האחרון כשם, והשאר כמיקום; שם בכתובת (מקפים במקום
 * רווחים) — עם רווחים; ספר אישי — בלי הקידומת, ועם סימון.
 * path — האם "/" בשם הוא נתיב (רק בספר מדיקטה; בשם רגיל — "/" הוא חלק מהשם).
 * @param {string} base
 * @param {{ path?: boolean }} [options]
 * @returns {{ title: string, location: string | null, personal: boolean }}
 */
export function displayBookName(base, { path = true } = {}) {
  let text = String(base ?? '').trim()
  const personal = PERSONAL_PREFIX.test(text)
  if (personal) text = text.replace(PERSONAL_PREFIX, '')

  let location = null
  if (path && text.includes('/')) {
    const parts = text.split('/').map((p) => p.trim()).filter(Boolean)
    text = parts.pop() || text
    location = parts.length > 0 ? parts.join(' › ') : null
  }
  // שם בכתובת: אין בו רווח אבל יש מקפים — הם היו רווחים
  if (!/\s/.test(text) && text.includes('-')) text = text.replace(/-+/g, ' ').trim()
  return { title: text || 'ללא שם', location, personal }
}

const time = (value) => {
  const t = new Date(value ?? 0).getTime()
  return Number.isFinite(t) ? t : 0
}

/**
 * @typedef {object} UploadGroup
 * @property {string} key       — מפתח יציב (מנורמל)
 * @property {string} base      — שם הספר כפי שנשלח (מההעלאה האחרונה)
 * @property {string} title     — שם לתצוגה
 * @property {string|null} location — מיקום (בנתיב של דיקטה)
 * @property {boolean} personal — ספר אישי של משתמש
 * @property {any[]} uploads    — מהחדשה לישנה (לפי dateField)
 * @property {number} latest    — זמן ההעלאה החדשה ביותר (ms)
 * @property {number} earliest  — זמן הוותיקה ביותר (ms)
 * @property {string} searchText — שם הספר והמיקום, מנורמלים (לחיפוש — מחושב פעם אחת)
 */

/**
 * מקבץ העלאות לפי ספר. הקבוצות ממוינות מהחדשה לישנה (לפי ההעלאה האחרונה בכל קבוצה), וגם
 * ההעלאות בתוך כל קבוצה.
 * @param {any[]} uploads
 * @param {{ dateField?: string }} [options] — uploadedAt (העלאות) או deletedAt (אשפה)
 * @returns {UploadGroup[]}
 */
export function groupUploadsByBook(uploads, { dateField = 'uploadedAt' } = {}) {
  /** @type {Map<string, any[]>} */
  const byKey = new Map()
  for (const upload of uploads || []) {
    const { base } = parseUploadName(upload?.bookName)
    const key = bookGroupKey(base)
    const list = byKey.get(key)
    if (list) list.push(upload)
    else byKey.set(key, [upload])
  }

  const groups = []
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => time(b[dateField]) - time(a[dateField]))
    const base = parseUploadName(sorted[0]?.bookName).base
    const name = displayBookName(base, { path: sorted.some((u) => u?.uploadType === 'dicta') })
    groups.push({
      key,
      base,
      ...name,
      searchText: normalizeHebrew(`${name.title} ${name.location || ''}`),
      uploads: sorted,
      latest: time(sorted[0]?.[dateField]),
      earliest: time(sorted[sorted.length - 1]?.[dateField]),
    })
  }
  return groups.sort((a, b) => b.latest - a.latest || a.key.localeCompare(b.key, 'he'))
}

/**
 * ההיקף של קבוצת העלאות במונחי ספרים — להודעות ("3 ספרים הועברו לאשפה") ולסרגל הבחירה.
 * title — שם הספר כשהוא אחד (אחרת null).
 * @param {any[]} uploads
 * @returns {{ books: number, uploads: number, title: string | null }}
 */
export function bookScope(uploads) {
  const titles = new Map()
  for (const upload of uploads || []) {
    const { base } = parseUploadName(upload?.bookName)
    const key = bookGroupKey(base)
    if (!titles.has(key)) titles.set(key, displayBookName(base, { path: upload?.uploadType === 'dicta' }).title)
  }
  const [first] = titles.values()
  return { books: titles.size, uploads: (uploads || []).length, title: titles.size === 1 ? first : null }
}

/** האם ההעלאה היא עמוד (לניסוח "12 עמודים" מול "12 קבצים") */
export function isPageUpload(upload) {
  return parseUploadName(upload?.bookName).page !== null
}

/**
 * הסדר של הקבצים בספר פתוח: עמודים — לפי מספר העמוד (כך מורידים ובודקים ברצף); אחרת — כמו
 * שהם (מהחדש לישן). גרסה ישנה של אותו עמוד — אחרי הנוכחית.
 * @param {any[]} uploads
 */
export function orderGroupItems(uploads) {
  const list = uploads || []
  if (list.length < 2 || !list.every(isPageUpload)) return list
  return [...list].sort((a, b) => {
    const pa = parseUploadName(a.bookName)
    const pb = parseUploadName(b.bookName)
    return pa.page - pb.page || Number(pa.oldVersion) - Number(pb.oldVersion)
  })
}

/**
 * תווית קצרה של העלאה בתוך הקבוצה: "עמוד 83" לעמוד, ושם הקובץ לספר שלם.
 * @param {any} upload
 */
export function uploadItemLabel(upload) {
  const { base, page, oldVersion } = parseUploadName(upload?.bookName)
  const label = page !== null ? `עמוד ${page}` : upload?.originalFileName || displayBookName(base).title
  return oldVersion ? `${label} (גרסה ישנה)` : label
}

/**
 * המצב של הספר (bookStatus) לכל הקבוצה: המפתח, אם כל ההעלאות באותו מצב; אחרת null (מעורב).
 * @param {any[]} uploads
 * @param {string} [fallback]
 */
export function groupBookStatus(uploads, fallback = 'not_checked') {
  let status
  for (const upload of uploads || []) {
    const value = upload?.bookStatus || fallback
    if (status === undefined) status = value
    else if (status !== value) return null
  }
  return status ?? fallback
}

/**
 * מי העלה את הקבוצה: מעלה יחיד — הוא; כמה — הראשון (החדש) ומספר הנוספים.
 * @param {any[]} uploads
 * @returns {{ name: string, email: string | null, others: number }}
 */
export function groupUploaders(uploads) {
  const seen = new Map()
  for (const upload of uploads || []) {
    const key = uploaderKey(upload)
    if (!seen.has(key)) seen.set(key, { name: upload?.uploadedBy || 'אורח', email: upload?.uploadedByEmail || null })
  }
  const [first] = seen.values()
  return { name: first?.name || 'אורח', email: first?.email || null, others: Math.max(0, seen.size - 1) }
}

/** מפתח המעלה לסינון: האימייל, ובלעדיו השם ("אורח" להעלאה בלי משתמש) */
export function uploaderKey(upload) {
  return upload?.uploadedByEmail || upload?.uploadedBy || 'אורח'
}
