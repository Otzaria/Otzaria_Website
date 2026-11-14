// ספרים בממשק הניהול — לוגיקה טהורה: התקדמות, מצב, בעלות, קטגוריה, וניסוח (מספרים, הודעות, דיאלוגים).
// בלי DOM ובלי React. הניסוח לפי מילון השמות: "בעבודה", "הושלם", "מוסתר", "הסתר / הצג", "מזג ספרים",
// "מחק לצמיתות", "הנחיות עריכה", "זיהוי טקסט אוטומטי".
import { booksCountText, formatNumber } from '../adminTerms.js'
import { bulkProgressText as bulkProgressLine } from '../adminList/bulkText.js'
import { fileSizeText as sizeText } from '../adminList/fileSize.js'

export { booksCountText, formatNumber }

/** קידומת הקטגוריה שהשרת נותן לספר אישי ("אישי - שם המשתמש") — לא קטגוריה אמיתית, אלא בעלות */
export const PERSONAL_CATEGORY_PREFIX = 'אישי - '
/** הקטגוריה של ספר בלי קטגוריה (כמו בשרת) */
export const DEFAULT_CATEGORY = 'כללי'

/**
 * ספר כפי שהוא מגיע מהשרת — מעמוד הניהול (מזהים כמחרוזות) או מ-/api/library/list (ownerId כאובייקט
 * מאוכלס { _id, name }, מזהה כ-ObjectId מסורלז) — לצורה אחת, כדי שהמסך לא יבדוק את שתיהן בכל מקום.
 * בלי editingInfo (שמגיע מ-/api/library/list): הרשימה לא צריכה אותו, והמגירה טוענת אותו לספר אחד.
 * @param {any} raw
 */
export function normalizeBook(raw) {
  const idOf = (v) => {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'object') return v._id !== undefined ? String(v._id) : (v.$oid ? String(v.$oid) : null)
    return String(v)
  }
  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  }
  const total = num(raw?.totalPages)
  return {
    id: idOf(raw?.id ?? raw?._id) ?? '',
    name: String(raw?.name ?? ''),
    path: String(raw?.path ?? raw?.slug ?? ''),
    thumbnail: raw?.thumbnail || null,
    totalPages: total,
    completedPages: num(raw?.completedPages),
    inProgressPages: num(raw?.inProgressPages),
    category: String(raw?.category || DEFAULT_CATEGORY),
    lastUpdated: raw?.lastUpdated ? String(raw.lastUpdated) : null,
    isHidden: raw?.isHidden === true,
    isPrivate: raw?.isPrivate === true,
    ownerId: idOf(raw?.ownerId),
    ownerName: raw?.ownerName || (typeof raw?.ownerId === 'object' ? raw?.ownerId?.name : null) || null,
    originalOwnerId: idOf(raw?.originalOwnerId),
    originalOwnerName: raw?.originalOwnerName || null,
  }
}

/** ספר אישי עכשיו (של משתמש מסוים): אי אפשר להציג אותו לציבור ולא לשנות לו קטגוריה */
export function isPersonal(book) {
  return Boolean(book?.isPrivate || book?.ownerId)
}

/**
 * הבעלות על הספר: ציבורי, אישי (של מי), או "היה אישי" — ספר אישי שהושלם והפך לציבורי.
 * @returns {{ kind: 'public' | 'personal' | 'was_personal', owner: string | null, label: string }}
 */
export function bookOwnership(book) {
  if (isPersonal(book)) {
    const owner = book.ownerName || personalCategoryOwner(book.category) || null
    return { kind: 'personal', owner, label: owner ? `אישי · ${owner}` : 'אישי' }
  }
  if (book?.originalOwnerId) {
    const owner = book.originalOwnerName || null
    return { kind: 'was_personal', owner, label: owner ? `היה אישי · ${owner}` : 'היה אישי' }
  }
  return { kind: 'public', owner: null, label: 'ציבורי' }
}

function personalCategoryOwner(category) {
  return typeof category === 'string' && category.startsWith(PERSONAL_CATEGORY_PREFIX)
    ? category.slice(PERSONAL_CATEGORY_PREFIX.length).trim() || null
    : null
}

/**
 * הקטגוריה להצגה ולסינון — null כשהקטגוריה היא בעצם הבעלות ("אישי - משה"): בשורה כבר כתוב "אישי · משה".
 * @returns {string | null}
 */
export function displayCategory(book) {
  const category = book?.category || DEFAULT_CATEGORY
  return category.startsWith(PERSONAL_CATEGORY_PREFIX) ? null : category
}

/**
 * ההתקדמות של ספר. percent — מעוגל כלפי מטה, כך ש-99.6% לא יוצג כ-100% כשעוד חסר עמוד.
 * stage: empty (אין עמודים) / not_started / in_progress / completed.
 */
export function bookProgress(book) {
  const total = Math.max(0, Number(book?.totalPages) || 0)
  const completed = Math.min(total, Math.max(0, Number(book?.completedPages) || 0))
  const inProgress = Math.min(total - completed, Math.max(0, Number(book?.inProgressPages) || 0))
  const available = Math.max(0, total - completed - inProgress)
  const percent = total > 0 ? Math.floor((completed / total) * 100) : 0
  let stage = 'not_started'
  if (total === 0) stage = 'empty'
  else if (completed >= total) stage = 'completed'
  else if (completed > 0 || inProgress > 0) stage = 'in_progress'
  return { total, completed, inProgress, available, percent, stage }
}

/** "120 מתוך 340 הושלמו" — בלי אחוזים (המספרים עצמם ברורים יותר), ובלי "עמודים" (נכון גם ל-1) */
export function progressText(progress) {
  if (progress.total === 0) return 'אין עמודים'
  return `${formatNumber(progress.completed)} מתוך ${formatNumber(progress.total)} הושלמו`
}

/** "עמוד אחד" / "12 עמודים" */
export function pagesText(n) {
  return n === 1 ? 'עמוד אחד' : `${formatNumber(n)} עמודים`
}

/** "5 בעבודה" — עמודים שמישהו לקח ועוד לא סיים */
export function inProgressText(n) {
  return `${formatNumber(n)} בעבודה`
}

/** "ספר אחד נבחר" / "3 ספרים נבחרו" */
export function selectedBooksText(n) {
  return n === 1 ? 'ספר אחד נבחר' : `${booksCountText(n)} נבחרו`
}

/**
 * צבע קטגוריה מהשרת (hex) — רק צבע תקין (#rgb / #rrggbb) נכנס ל-style; אחר — null (נקודה ניטרלית).
 * @param {unknown} value
 */
export function safeColor(value) {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim().toLowerCase() : null
}

/**
 * איזה מצב ריק להציג: none — אין ספרים בכלל; no-match — יש, אבל הסינון לא מצא; null — יש מה להציג.
 * @param {{ total: number, shown: number }} counts
 */
export function emptyStateKind({ total, shown }) {
  if (total === 0) return 'none'
  if (shown === 0) return 'no-match'
  return null
}

/**
 * פעולה מרובה — על אילו ספרים היא תחול באמת, ואילו יידלגו (ולמה):
 *   hide     — ספרים שעוד לא מוסתרים
 *   show     — ספרים מוסתרים, חוץ מאישיים (השרת לא מציג ספר אישי לציבור)
 *   category — ספרים לא אישיים שהקטגוריה שלהם שונה מהחדשה (לאישי אין קטגוריה לשנות)
 * @param {any[]} books
 * @param {'hide' | 'show' | 'category'} action
 * @param {string} [value] — הקטגוריה החדשה
 * @returns {{ targets: any[], personal: number, unchanged: number }}
 */
export function bulkPlan(books, action, value) {
  const targets = []
  let personal = 0
  let unchanged = 0
  for (const book of books) {
    if (action === 'hide') {
      if (book.isHidden) unchanged++
      else targets.push(book)
    } else if (action === 'show') {
      if (!book.isHidden) unchanged++
      else if (isPersonal(book)) personal++
      else targets.push(book)
    } else if (action === 'category') {
      if (isPersonal(book)) personal++
      else if ((book.category || DEFAULT_CATEGORY) === value) unchanged++
      else targets.push(book)
    }
  }
  return { targets, personal, unchanged }
}

/**
 * הודעה אחרי פעולה מרובה: מה נעשה, ומה דולג ולמה. tone=error כשלא נעשה כלום.
 * stopped — כמה לא נשלחו כי המשתמש עצר; busy — כמה דולגו כי כבר רצה עליהם פעולה אחרת.
 * @param {'hide' | 'show' | 'category'} action
 * @param {{ done: number, failed?: number, personal?: number, unchanged?: number, stopped?: number, busy?: number, category?: string }} result
 */
export function bulkResultText(action, { done, failed = 0, personal = 0, unchanged = 0, stopped = 0, busy = 0, category }) {
  const verb = {
    hide: done === 1 ? 'הוסתר' : 'הוסתרו',
    show: done === 1 ? 'מוצג עכשיו לכולם' : 'מוצגים עכשיו לכולם',
    category: done === 1 ? `הועבר לקטגוריה "${category}"` : `הועברו לקטגוריה "${category}"`,
  }[action]
  const parts = []
  if (done > 0) parts.push(`${booksCountText(done)} ${verb}.`)
  if (failed > 0) parts.push(`${failed === 1 ? 'ספר אחד לא עודכן' : `${booksCountText(failed)} לא עודכנו`} — נסה שוב.`)
  if (personal > 0) {
    parts.push(action === 'show'
      ? `${personal === 1 ? 'ספר אישי אחד נשאר מוסתר' : `${formatNumber(personal)} ספרים אישיים נשארו מוסתרים`}: ספר אישי לא מוצג לכולם.`
      : `${personal === 1 ? 'ספר אישי אחד לא הועבר' : `${formatNumber(personal)} ספרים אישיים לא הועברו`}: לספר אישי אין קטגוריה לשנות.`)
  }
  if (stopped > 0) parts.push(`נעצר — ${stopped === 1 ? 'ספר אחד לא עודכן' : `${booksCountText(stopped)} לא עודכנו`}.`)
  if (busy > 0) parts.push(`${busy === 1 ? 'ספר אחד דולג' : `${booksCountText(busy)} דולגו`}: כבר רצה עליו פעולה אחרת.`)
  if (unchanged > 0 && done === 0 && failed === 0 && personal === 0 && stopped === 0 && busy === 0) {
    parts.push({
      hide: 'כל הספרים שנבחרו כבר מוסתרים.',
      show: 'כל הספרים שנבחרו כבר מוצגים.',
      category: `כל הספרים שנבחרו כבר בקטגוריה "${category}".`,
    }[action])
  }
  return { message: parts.join(' '), tone: done === 0 && (failed > 0 || personal > 0 || busy > 0) ? 'error' : 'success' }
}

/** מה הפעולה המרובה עושה עכשיו — לשורת ההתקדמות: "מסתיר… 120 מתוך 2,745" */
export function bulkProgressText(action, { done, total }) {
  const verb = { hide: 'מסתיר', show: 'מציג', category: 'מעביר לקטגוריה', undo: 'מבטל' }[action] || 'מעדכן'
  return bulkProgressLine(verb, { done, total })
}

/** ההודעה אחרי "בטל" של פעולה מרובה */
export function bulkUndoText({ done, failed }) {
  const parts = [done === 1 ? 'השינוי בוטל בספר אחד.' : `השינוי בוטל ב-${booksCountText(done)}.`]
  if (failed > 0) parts.push(`${failed === 1 ? 'בספר אחד' : `ב-${booksCountText(failed)}`} לא הצלחנו לבטל — נסה שוב.`)
  return { message: parts.join(' '), tone: done === 0 ? 'error' : 'success' }
}

/**
 * לפני מיזוג: אילו מהספרים כבר התחילו לעבוד עליהם. במיזוג כל העמודים נוצרים מחדש כ"פנוי", בלי הטקסט
 * שכבר נערך — לכן מיזוג מותר רק בספרים שלא התחילו.
 * @returns {{ book: any, completed: number, inProgress: number }[]}
 */
export function startedBooks(books) {
  return books
    .map((book) => ({ book, ...bookProgress(book) }))
    .filter((p) => p.completed > 0 || p.inProgress > 0)
    .map(({ book, completed, inProgress }) => ({ book, completed, inProgress }))
}

/** שורת אזהרה לספר שכבר התחילו לעבוד עליו: "חוות דעת — 12 עמודים הושלמו, 3 בעבודה" */
export function startedBookText({ book, completed, inProgress }) {
  const parts = []
  if (completed > 0) parts.push(completed === 1 ? 'עמוד אחד הושלם' : `${formatNumber(completed)} עמודים הושלמו`)
  if (inProgress > 0) parts.push(inProgressText(inProgress))
  return `${book.name} — ${parts.join(', ')}`
}

/** הסכום של העמודים בספר המאוחד */
export function mergedPagesText(books) {
  return pagesText(books.reduce((sum, b) => sum + (Number(b.totalPages) || 0), 0))
}

/**
 * הדיאלוג לפני "מחק לצמיתות" של ספר: מה יימחק, במספרים. bodyAfterName — המשך המשפט שאחרי שם הספר
 * (השם עצמו — במירכאות ובבידוד כיווניות, אצל הרכיב).
 * @returns {{ title: string, bodyAfterName: string, details: string[], confirmLabel: string }}
 */
export function deleteBookDialog(book) {
  const p = bookProgress(book)
  const details = [`${pagesText(p.total)} והתמונות שלהם`]
  if (p.completed > 0) details.push(`הטקסט של ${p.completed === 1 ? 'העמוד שהושלם' : `${formatNumber(p.completed)} העמודים שהושלמו`}`)
  if (p.inProgress > 0) details.push(`העבודה של מי שעובד עכשיו על ${p.inProgress === 1 ? 'עמוד אחד' : `${formatNumber(p.inProgress)} עמודים`}`)
  details.push('הנחיות העריכה של הספר')
  return {
    title: 'למחוק לצמיתות את הספר?',
    bodyAfterName: ' יימחק מהמערכת, ולא יהיה אפשר לשחזר אותו. יימחקו:',
    details,
    confirmLabel: 'מחק לצמיתות',
  }
}

/** שם הקובץ להורדה: בלי תווים שאסורים בשמות קבצים */
export function downloadFileName(name, suffix, ext) {
  const base = String(name || 'ספר').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'ספר'
  return `${base}${suffix ? ` - ${suffix}` : ''}.${ext}`
}

/** הגודל המרבי של PDF להעלאה (כמו בשרת: /api/admin/books/upload) */
export const MAX_PDF_BYTES = 50 * 1024 * 1024

/** שם ספר מוצע משם הקובץ: בלי הסיומת, וקווים תחתונים כרווחים */
export function nameFromFile(filename) {
  return String(filename || '').replace(/\.[^/.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** "3.4 MB" / "820 KB" — גודל קובץ קריא (הנוסח האחיד — adminList/fileSize.js) */
export function fileSizeText(bytes) {
  return sizeText(Number(bytes) || 0)
}

/**
 * בדיקת טופס "הוספת ספר" לפני ההעלאה — אותם כללים כמו בשרת, כדי לא להעלות 50MB ואז לקבל שגיאה.
 * @param {{ name: string, file: { name: string, size: number, type?: string } | null }} form
 * @returns {{ name?: string, file?: string }}
 */
export function newBookErrors({ name, file }) {
  const errors = {}
  if (!String(name || '').trim()) errors.name = 'כתוב שם לספר.'
  if (!file) errors.file = 'בחר קובץ PDF.'
  else if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) errors.file = 'הקובץ צריך להיות PDF.'
  else if (file.size > MAX_PDF_BYTES) errors.file = `הקובץ גדול מדי (${fileSizeText(file.size)}). אפשר עד 50MB.`
  return errors
}
