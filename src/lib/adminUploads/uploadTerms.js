// אוצר המילים של מסך ההעלאות — שמות הסוגים, המצבים, הפעולות וההודעות, לפי מילון השמות של ממשק
// הניהול (מחק = העבר לאשפה; מחק לצמיתות; שחזר; רוקן אשפה; הורד + מה; שלח הודעה). לוגיקה טהורה.
//
// מצבי הספר (bookStatus) מוגדרים בידי המנהלים ("הגדרות מצבים": מפתח → תווית וצבע) ונשמרים
// במערכת; השמות שלהם הם של המנהלים ולא מוחלפים כאן. ברירות המחדל למטה — רק לתצוגה, כשהמפתח
// לא נמצא בהגדרות (או לפני שנטענו); הן זהות לברירות המחדל של /api/admin/book-statuses.
import { ageText, booksCountText, formatNumber, fullDateText } from '../adminTerms.js'

// משותפים לכל מסכי הניהול — מוגדרים ב-lib/adminTerms.js, ומיוצאים גם מכאן בשביל מי שכבר מייבא מכאן
export { ageText, booksCountText, formatNumber, fullDateText }

/** המצב של העלאה שאף אחד עוד לא טיפל בה — "התור" של המסך */
export const QUEUE_STATUS = 'not_checked'

export const DEFAULT_BOOK_STATUSES = Object.freeze({
  not_checked: { label: 'לא נבדק', color: '#94a3b8' },
  needs_attention: { label: 'דורש טיפול', color: '#f59e0b' },
  ready: { label: 'תקין ומוכן להכנסה', color: '#10b981' },
  added_to_library: { label: 'הוכנס לספרייה', color: '#3b82f6' },
})

/** שם הסוג בשורה */
export const UPLOAD_TYPE_LABELS = Object.freeze({
  full_book: 'ספר שלם',
  single_page: 'עמוד',
  dicta: 'ספר מדיקטה',
})

/** שם הסוג באפשרויות הסינון (רבים) */
export const UPLOAD_TYPE_FILTER_LABELS = Object.freeze({
  full_book: 'ספרים',
  single_page: 'עמודים',
})

const COLOR = /^#[0-9a-f]{3,8}$/i

/**
 * שם וצבע של מצב ספר: מההגדרות, אחרת מברירות המחדל, ואחרת המפתח עצמו (מצב שנמחק מההגדרות).
 * צבע לא תקין (ההגדרות נערכות ידנית) — אפור.
 * @param {string | null | undefined} key
 * @param {Record<string, { label?: string, color?: string }> | null | undefined} statuses
 * @returns {{ key: string, label: string, color: string }}
 */
export function bookStatusView(key, statuses) {
  const id = key || QUEUE_STATUS
  const config = statuses?.[id] || DEFAULT_BOOK_STATUSES[id]
  const label = String(config?.label || '').trim() || id
  const color = COLOR.test(String(config?.color || '')) ? config.color : '#94a3b8'
  return { key: id, label, color }
}

/**
 * אפשרויות המצב לבחירה ולסינון: בסדר ההגדרות, ואחריהן מצבים שקיימים בהעלאות אבל כבר לא
 * בהגדרות (כדי שלא ייעלמו מהסינון). count — מספר ההעלאות בכל מצב (אם נמסר).
 * @param {Record<string, { label?: string, color?: string }> | null | undefined} statuses
 * @param {Map<string, number>} [counts]
 * @returns {{ value: string, label: string, color: string, count: number }[]}
 */
export function bookStatusOptions(statuses, counts = new Map()) {
  const source = statuses && Object.keys(statuses).length > 0 ? statuses : DEFAULT_BOOK_STATUSES
  const keys = [...Object.keys(source)]
  for (const key of counts.keys()) if (!keys.includes(key)) keys.push(key)
  return keys.map((key) => {
    const view = bookStatusView(key, source)
    return { value: key, label: view.label, color: view.color, count: counts.get(key) || 0 }
  })
}

/** "העלאה אחת" / "12 העלאות" */
export function uploadsCountText(n) {
  return n === 1 ? 'העלאה אחת' : `${formatNumber(n)} העלאות`
}

/** "קובץ אחד" / "12 קבצים" */
export function filesCountText(n) {
  return n === 1 ? 'קובץ אחד' : `${formatNumber(n)} קבצים`
}

/** תווית הפעולה הראשית "הורד" — מה יורד: קובץ, או כל הקבצים של הספר כקובץ אחד */
export function downloadLabel(fileCount) {
  return fileCount > 1 ? `הורד ${filesCountText(fileCount)}` : 'הורד קובץ'
}

/**
 * היקף של פעולה — כמה ספרים וכמה העלאות, ושם הספר כשהוא אחד (uploadGroups.bookScope).
 * @typedef {{ books: number, uploads: number, title?: string | null }} BookScope
 */

/**
 * משפט על מה שקרה, במונחי ספרים: ספר אחד — בשמו; כמה — "3 ספרים (101 העלאות)".
 * verb — { one, many }: "הועבר לאשפה" / "הועברו לאשפה".
 *   ספר אחד, העלאה אחת:   "חוות דעת" הועבר לאשפה
 *   ספר אחד, כמה העלאות:  12 העלאות של "חוות דעת" הועברו לאשפה
 *   כמה ספרים:            3 ספרים הועברו לאשפה (101 העלאות)
 *   בלי ספרים (רק מספר):   292 העלאות הועברו לאשפה
 * @param {{ one: string, many: string }} verb
 * @param {BookScope} scope
 */
function scopeSentence(verb, { books, uploads, title }) {
  if (books === 1 && title) {
    return uploads === 1 ? `"${title}" ${verb.one}` : `${uploadsCountText(uploads)} של "${title}" ${verb.many}`
  }
  if (books > 1) return `${booksCountText(books)} ${verb.many} (${uploadsCountText(uploads)})`
  return uploads === 1 ? `העלאה אחת ${verb.oneUpload || verb.one}` : `${uploadsCountText(uploads)} ${verb.many}`
}

/** ההודעה אחרי "מחק" (העברה לאשפה) */
export function movedToTrashText(scope) {
  return scopeSentence({ one: 'הועבר לאשפה', oneUpload: 'הועברה לאשפה', many: 'הועברו לאשפה' }, scope)
}

/** ההודעה אחרי "שחזר" */
export function restoredText(scope) {
  return scopeSentence({ one: 'שוחזר', oneUpload: 'שוחזרה', many: 'שוחזרו' }, scope)
}

/** ההודעה אחרי "מחק לצמיתות" / "רוקן אשפה" */
export function deletedForeverText(scope) {
  return scopeSentence({ one: 'נמחק לצמיתות', oneUpload: 'נמחקה לצמיתות', many: 'נמחקו לצמיתות' }, scope)
}

/**
 * ההודעה אחרי שינוי מצב: 'המצב של "חוות דעת" שונה ל"מוכן"' / 'המצב של 3 ספרים שונה ל"מוכן"'.
 * label — null כשבצבירה של כמה שינויים יש כמה מצבים חדשים ("המצב של 3 ספרים שונה").
 */
export function statusChangedText(label, { books, title }) {
  const subject = books === 1 && title ? `"${title}"` : booksCountText(books)
  return label ? `המצב של ${subject} שונה ל"${label}"` : `המצב של ${subject} שונה`
}

/** ההודעה אחרי "בטל" של שינוי מצב */
export function statusRevertedText({ books, title }) {
  const subject = books === 1 && title ? `"${title}"` : booksCountText(books)
  return `המצב הקודם של ${subject} הוחזר`
}

/**
 * כשל חלקי: השרת שינה רק חלק (מישהו אחר כבר שינה / מחק). done — כמה שונו, total — כמה נשלחו.
 * @param {'trash' | 'restore' | 'deleteForever' | 'status'} kind
 */
export function partialText(kind, done, total) {
  const verb = { trash: 'הועברו לאשפה', restore: 'שוחזרו', deleteForever: 'נמחקו', status: 'עודכנו' }[kind]
  return `רק ${formatNumber(done)} מתוך ${uploadsCountText(total)} ${verb}. ייתכן שמישהו אחר כבר שינה אותן — רענן את הרשימה.`
}

/**
 * כמה נבחרו — לסרגל הפעולות המרובות (מוכרז לקורא מסך), במונחי ספרים:
 * "ספר אחד נבחר" / "ספר אחד נבחר · 12 העלאות" / "3 ספרים נבחרו · 101 העלאות".
 * @param {{ books: number, uploads: number }} scope
 */
export function selectedText({ books, uploads }) {
  const head = books === 1 ? 'ספר אחד נבחר' : `${booksCountText(books)} נבחרו`
  return uploads > books ? `${head} · ${uploadsCountText(uploads)}` : head
}

/**
 * הדיאלוג לפני "מחק לצמיתות" (מהאשפה): כותרת קצרה (שאלה עם מספר), ושם הספר בגוף.
 * @param {BookScope} scope
 */
export function permanentDeleteDialog({ books, uploads, title }) {
  const what = uploads === 1 ? 'העלאה אחת' : uploadsCountText(uploads)
  let body
  if (books === 1 && title) {
    body = uploads === 1
      ? `"${title}" יימחק מהמערכת, ולא יהיה אפשר לשחזר אותו.`
      : `${uploadsCountText(uploads)} של "${title}" יימחקו מהמערכת, ולא יהיה אפשר לשחזר אותן.`
  } else {
    body = `${uploadsCountText(uploads)} מ-${booksCountText(books)} יימחקו מהמערכת, ולא יהיה אפשר לשחזר אותן.`
  }
  return { title: `למחוק לצמיתות ${what}?`, body, confirmLabel: 'מחק לצמיתות' }
}

/**
 * הדיאלוג לפני "רוקן אשפה": המספר המדויק בכותרת. filtered — יש סינון פעיל, ולכן חלק מההעלאות
 * שיימחקו לא מוצגות עכשיו.
 * @param {number} n
 * @param {{ filtered?: boolean }} [options]
 */
export function emptyTrashDialog(n, { filtered = false } = {}) {
  const hidden = filtered ? ' גם העלאות שהסינון מסתיר עכשיו יימחקו.' : ''
  return {
    title: n === 1 ? 'למחוק לצמיתות את ההעלאה שבאשפה?' : `למחוק לצמיתות את כל ${formatNumber(n)} ההעלאות שבאשפה?`,
    body: `אי אפשר לשחזר אותן אחר כך.${hidden}`,
    confirmLabel: 'רוקן אשפה',
  }
}

/**
 * איזה מצב ריק להציג:
 *   trash-empty — האשפה ריקה
 *   queue-clear — אין העלאות בכלל, או שהתור ("לא נבדק", בלי סינון נוסף) ריק
 *   no-match    — יש העלאות, אבל אף אחת לא מתאימה לסינון
 *   null        — יש מה להציג
 * @param {{ tab: 'uploads' | 'trash', total: number, shown: number,
 *   query: { q?: string, type?: string, user?: string[], status?: string[] } }} args
 * @returns {'trash-empty' | 'queue-clear' | 'no-match' | null}
 */
export function emptyStateKind({ tab, total, shown, query }) {
  if (shown > 0) return null
  const others = Boolean(query?.q || query?.type || query?.user?.length)
  const filtered = others || Boolean(query?.status?.length)
  if (tab === 'trash') return total === 0 || !filtered ? 'trash-empty' : 'no-match'
  if (total === 0) return 'queue-clear'
  const onlyQueue = query?.status?.length === 1 && query.status[0] === QUEUE_STATUS && !others
  return onlyQueue ? 'queue-clear' : 'no-match'
}

