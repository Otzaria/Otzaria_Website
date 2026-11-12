// "עמודים" (/library/admin/pages-management) — הניסוח: שמות המצבים, "עודכן לפני 12 ימים", ספירות, ההודעות של
// שחרור, שינוי מצב והורדה, והקובץ המאוחד. לוגיקה טהורה, בלי React ובלי DOM (נבדק ב-pageTerms.test.mjs).

import { calendarDay, formatNumber } from '../adminTerms.js'
import { bulkProgressText as bulkProgressLine } from '../adminList/bulkText.js'

export { formatNumber }

/** המצבים שיש לעמוד במסד (models/Page.js). "ממתין לאישור" — אין לעמודים מצב כזה, ולכן אינו כאן. */
export const PAGE_STATUSES = ['available', 'in-progress', 'completed']

export const STATUS_LABELS = { available: 'פנוי', 'in-progress': 'בעבודה', completed: 'הושלם' }

/** הצבע של תג המצב (ui/Badge) — מחזק בלבד; המשמעות בטקסט. "בעבודה" — בצבע הראשי, כמו ההתקדמות במסך "ספרים" */
export const STATUS_TONES = { available: 'neutral', 'in-progress': 'primary', completed: 'success' }

export function statusLabel(status) {
  return STATUS_LABELS[status] || 'לא ידוע'
}

/**
 * "בלי שינוי יותר מ-": האפשרויות, בימים. נמדד מהשמירה האחרונה (updatedAt), לא מזמן הלקיחה.
 * למה 3 / 7 / 14 (ולא 30): ה-cron (api/cron/check-stale-pages) שולח למתנדב תזכורת אחרי 7 ימים בלי שינוי, ומשחרר
 * לבד אחרי 14 — חוץ מספרים אישיים, שאותם הוא לא משחרר. כך שעמוד בספר רגיל כמעט לא נשאר בעבודה יותר מ-14 ימים,
 * ו-30 היה מוצא רק ספרים אישיים (כמו 14).
 */
export const STALE_DAYS = [3, 7, 14]

export const STALE_LABEL = 'בלי שינוי יותר מ-'

/** ההסבר מתחת לכל אפשרות בבורר */
export const STALE_HINTS = {
  3: 'נמדד מהשמירה האחרונה בעמוד, לא מהזמן שבו נלקח',
  7: 'אחרי שבוע בלי שינוי המתנדב מקבל תזכורת',
  14: 'בספרים רגילים עמוד כזה משתחרר לבד, ולכן כאן יופיעו בעיקר ספרים אישיים',
}

/** עמוד בעבודה בלי תאריך עדכון (נחשב ותיק — מופיע בכל "בלי שינוי יותר מ-") */
export const NO_DATE_TEXT = 'לא ידוע'
export const NO_DATE_TITLE = 'אין לעמוד תאריך עדכון, ולכן הוא נחשב ותיק'

export const DAY_MS = 24 * 60 * 60 * 1000

const toTime = (date) => {
  if (date === null || date === undefined || date === '') return NaN
  return new Date(date).getTime()
}

/**
 * כמה זמן עבר מהעדכון — במילים, ובלי לעבור לתאריך (בניגוד ל-ageText): במסך הזה מחפשים עמודים תקועים, ו"לפני
 * 40 ימים" אומר יותר מ-"28.9.2026". ימים — לפי לוח השנה בשעון ירושלים; מחודשיים ומעלה — חודשים, ומשנה — שנים.
 * תאריך לא תקין — "".
 * @param {string | number | Date | null | undefined} date
 * @param {number} [now]
 */
export function updatedAgoText(date, now = Date.now()) {
  const ms = toTime(date)
  if (!Number.isFinite(ms)) return ''
  const days = calendarDay(now) - calendarDay(ms)
  if (days <= 0) return 'היום'
  if (days === 1) return 'אתמול'
  if (days === 2) return 'לפני יומיים'
  if (days < 60) return `לפני ${formatNumber(days)} ימים`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 2 ? 'לפני חודשיים' : `לפני ${formatNumber(months)} חודשים`
  }
  const years = Math.floor(days / 365)
  if (years === 1) return 'לפני שנה'
  if (years === 2) return 'לפני שנתיים'
  return `לפני ${formatNumber(years)} שנים`
}

/** עמוד בעבודה שלא עודכן לפחות days ימים (לפי "עודכן"; בלי תאריך — נחשב ותיק) */
export function isStale(page, days, now = Date.now()) {
  if (page?.status !== 'in-progress' || !days) return false
  const ms = toTime(page.updatedAt)
  if (!Number.isFinite(ms)) return true
  return now - ms >= days * DAY_MS
}

/** "עמוד 12" */
export function pageLabel(number) {
  return `עמוד ${formatNumber(number)}`
}

/** "עמוד אחד" / "1,234 עמודים" */
export function pagesCountText(n) {
  return n === 1 ? 'עמוד אחד' : `${formatNumber(n)} עמודים`
}

/** שם הקובץ בהורדת עמוד אחד — כמו במסך הקודם */
export function pageFilename(page) {
  return `${page.bookName}-${page.number}.txt`
}

/**
 * הקובץ המאוחד של "הורד טקסט" לכמה עמודים. of — כמה נבחרו: כשירדו פחות (עצרת / נכשל) — השם אומר שהוא חלקי.
 * @param {number} count @param {number} [of]
 */
export function combinedFilename(count, of = count) {
  return of > count ? `עמודים-${count}-מתוך-${of}-חלקי.txt` : `עמודים-${count}.txt`
}

/** העורך של העמוד (העורך מוצא ספר גם לפי השם — ראו api/page-content) */
export function editorHref(page) {
  return `/library/books/${encodeURIComponent(page.bookName)}/${page.number}`
}

const RULE = '========================================'

/**
 * קובץ טקסט אחד מכמה עמודים — באותה צורה כמו "הורד הכול" (api/admin/pages/download-batch): כותרת לכל עמוד,
 * והטקסט שלו כמו שהשרת החזיר.
 * @param {{ bookName: string, number: number, text: string }[]} entries
 */
export function combinedText(entries) {
  return (entries || [])
    .map((e) => `${RULE}\nספר: ${e.bookName} | עמוד: ${e.number}\n${RULE}\n\n${e.text || ''}\n\n\n`)
    .join('')
}

const HEADER = /^={40}\nספר: (.*) \| עמוד: (\d+)\n={40}\n\n/gm

/**
 * הקובץ של השרת (download-batch — כל העמודים של ספר בקובץ אחד) בחזרה לעמודים: מספר העמוד ← הטקסט שלו. כך
 * "הורד טקסט" לעמודים רבים מאותו ספר הוא בקשה אחת, והקובץ שיורד בנוי מאותן חתיכות.
 * @param {string} text @returns {Map<number, string>}
 */
export function splitCombinedText(text) {
  const out = new Map()
  const source = String(text || '')
  const heads = [...source.matchAll(HEADER)]
  heads.forEach((m, i) => {
    const start = m.index + m[0].length
    const end = i + 1 < heads.length ? heads[i + 1].index : source.length
    // השרת מוסיף אחרי כל עמוד "\n" ועוד שתי שורות ריקות — בלעדיהן הטקסט זהה ל-download/:id (גם בשני טורים)
    out.set(Number(m[2]), source.slice(start, end).replace(/\n\n\n$/, ''))
  })
  return out
}

/** מי עובד על העמוד: השם; עמוד בעבודה בלי משתמש (המשתמש נמחק) — "משתמש שנמחק"; אחרת — "" */
export function workerText(page) {
  if (page?.claimedBy) return page.claimedBy
  return page?.status === 'in-progress' ? 'משתמש שנמחק' : ''
}

// ----- שחרור -----
// מה השחרור עושה (api/admin/pages/update): המצב — פנוי, והשיוך למתנדב נמחק. הטקסט נשמר. המתנדב לא מקבל הודעה ולא
// מאבד נקודות (5 הנקודות יורדות רק כשמתנדב משחרר בעצמו — api/book/release-page). אחרי השחרור כל מתנדב יכול לקחת
// את העמוד, גם מי שעבד עליו.

const quoted = (page) => `"${page.bookName}", ${pageLabel(page.number)}`

/** ההסבר על "שחרר" (title של הכפתור בשורה) */
export const RELEASE_HINT = 'העמוד יחזור להיות פנוי לכל המתנדבים. הטקסט נשמר, והמתנדב לא מקבל הודעה ולא מאבד נקודות.'

/** בזמן שאפשר עוד לבטל — אותו ניסוח בשורה ובהכרזה */
export const RELEASE_PENDING_LINE = 'ישוחרר בעוד כמה שניות'

export function releasedMessage(page) {
  return `${quoted(page)} שוחרר. עכשיו הוא פנוי לכל המתנדבים.`
}

export const RELEASE_CANCELLED_MESSAGE = 'השחרור בוטל. העמוד נשאר אצל מי שעובד עליו.'

/** בשורה של עמוד שהבדיקה לפני שליחה מצאה שהשתנה, כשהמצב החדש לא ידוע */
export const OUTDATED_LINE = 'השתנה — רענן'

/** בשורה של עמוד ששוחרר במסך (עד הרענון הבא) */
export const RELEASED_LINE = 'שוחרר'

/**
 * חלון האישור של "שחרר נבחרים". skipped — נבחרים שאינם בעבודה (לא ישתנו).
 * @param {number} count @param {number} [skipped]
 */
export function bulkReleaseConfirm(count, skipped = 0) {
  const one = count === 1
  const rest = skipped > 0 ? ` ${skipped === 1 ? 'עמוד אחד מהנבחרים אינו בעבודה ולא ישתנה.' : `${formatNumber(skipped)} מהנבחרים אינם בעבודה ולא ישתנו.`}` : ''
  return {
    title: one ? 'לשחרר עמוד אחד?' : `לשחרר ${formatNumber(count)} עמודים?`,
    body: `${one ? 'העמוד יחזור' : 'העמודים יחזרו'} להיות ${one ? 'פנוי' : 'פנויים'} לכל המתנדבים, ומי שעבד ${one ? 'עליו' : 'עליהם'} לא ${one ? 'יראה אותו' : 'יראה אותם'} יותר אצלו. הטקסט שכבר נכתב נשמר. המתנדבים לא מקבלים על זה הודעה ולא מאבדים נקודות.${rest}`,
    confirmLabel: one ? 'שחרר' : `שחרר ${formatNumber(count)}`,
    // לא אדום: אפשר לחזור מזה (העמוד פנוי, וכל אחד יכול לקחת אותו שוב)
    tone: 'default',
  }
}

/**
 * הבדיקה לפני שליחה: העמוד עדיין במצב ובשיוך שהיו כשהמשתמש בחר בו? השרת מעדכן לפי שם הספר ומספר העמוד בלבד, בלי
 * תנאי — לכן הבדיקה כאן, מול טעינה טרייה של הספר.
 * @param {{ status: string, claimedById?: any }} expected מה שהיה ברשימה
 * @param {{ status: string, claimedById?: any } | undefined} fresh מה שיש עכשיו בשרת (undefined — העמוד לא נמצא)
 * @returns {'ok' | 'gone' | 'changed'}
 */
export function checkUnchanged(expected, fresh) {
  if (!fresh) return 'gone'
  if (fresh.status !== expected.status) return 'changed'
  if (String(fresh.claimedById ?? '') !== String(expected.claimedById ?? '')) return 'changed'
  return 'ok'
}

/** שחרור / שינוי בודד שלא נשלח, כי העמוד השתנה מאז שהרשימה נטענה */
export function skippedMessage(action, page, result) {
  if (result === 'gone') return `${quoted(page)} לא נמצא יותר — ${action === 'status' ? 'לא שונה' : 'לא שוחרר'}. רענן את הרשימה.`
  return action === 'status'
    ? `${quoted(page)} השתנה בינתיים — לא שונה. בדוק את המצב החדש ונסה שוב.`
    : `${quoted(page)} כבר לא בעבודה אצל אותו משתמש — לא שוחרר.`
}

/** בסיכום של פעולה מרובה: כמה דולגו כי השתנו */
export function skippedText(n) {
  if (!(n > 0)) return ''
  return n === 1 ? 'עמוד אחד כבר לא בעבודה אצל אותו משתמש ולא שוחרר' : `${formatNumber(n)} כבר לא בעבודה אצל אותו משתמש ולא שוחררו`
}

// ----- שינוי מצב -----
// השרת (api/admin/pages/update, אותו גוף כמו "ערוך סטטוס" במסך הקודם: updates: { status }) משנה רק את המצב: לא
// מוסיף ולא מוריד נקודות, לא רושם תאריך השלמה, לא מעדכן את מונה העמודים שהושלמו בספר, ולא מוחק את השיוך למתנדב
// (השם נשאר ליד העמוד עד שמישהו אחר ייקח אותו).

/**
 * אפשר לשנות לזה? null — כן; אחרת — למה לא (מוצג ליד האפשרות).
 * @param {{ status: string, claimedById?: any }} page @param {string} to
 */
export function statusChangeBlocked(page, to) {
  if (page.status === to) return 'זה המצב הנוכחי'
  // "בעבודה" בלי מתנדב — אף אחד לא רואה אותו אצלו, ואי אפשר לקחת אותו (רק עמוד פנוי נלקח)
  if (to === 'in-progress' && !page.claimedById) return 'אין מתנדב שהעמוד יחזור אליו'
  return null
}

/**
 * מה יקרה — בחלון של "שנה מצב". danger — רק "פנוי": מי שעבד עליו מאבד אותו, ועמוד שהושלם חוזר לעבודה.
 * @param {{ bookName: string, number: number, status: string, claimedBy?: string | null }} page @param {string} to
 */
export function statusChangeConfirm(page, to) {
  const who = page.claimedBy || 'המתנדב'
  const lines = []
  if (to === 'available') {
    lines.push('העמוד יחזור להיות פנוי, וכל מתנדב יוכל לקחת אותו. הטקסט נשמר.')
    if (page.status === 'completed') lines.push('הוא כבר לא ייחשב כהושלם.')
    if (page.claimedBy) lines.push(`השם של ${who} יישאר ליד העמוד עד שמישהו ייקח אותו.`)
  } else if (to === 'in-progress') {
    lines.push(`העמוד יחזור לעבודה אצל ${who}. הטקסט נשמר.`)
  } else {
    lines.push('העמוד יסומן כהושלם. הטקסט נשמר כמו שהוא.')
  }
  const details = ['הנקודות של המתנדב לא משתנות (סימון "הושלם" כאן לא מוסיף נקודות).']
  if (to === 'completed' || page.status === 'completed') details.push('מונה העמודים שהושלמו בספר לא מתעדכן.')
  details.push('המתנדב לא מקבל על זה הודעה.')
  return {
    title: `לשנות ל"${statusLabel(to)}"?`,
    body: lines.join(' '),
    details,
    confirmLabel: `שנה ל"${statusLabel(to)}"`,
    tone: to === 'available' ? 'danger' : 'default',
  }
}

export function statusChangedMessage(page, to) {
  return `${quoted(page)} עכשיו "${statusLabel(to)}".`
}

// ----- פעולות מרובות -----

const VERBS = { release: 'משחרר', download: 'מוריד' }

/** "משחרר… 3 מתוך 10" */
export function bulkProgressText(action, { done, total }) {
  return bulkProgressLine(VERBS[action] || 'מעדכן', { done, total })
}

/** בזמן שבודקים את המצב העדכני לפני שליחה */
export const CHECKING_TEXT = 'בודק את המצב העדכני…'

/**
 * מתי להכריז על ההתקדמות לקורא מסך: בהתחלה, כל 10% ובסוף — לא על כל עמוד (באלפי עמודים זה מציף).
 * @param {number} lastAnnounced כמה היו בהכרזה הקודמת (-1 — עוד לא הוכרז) @param {number} done @param {number} total
 */
export function shouldAnnounce(lastAnnounced, done, total) {
  if (lastAnnounced < 0 || done >= total) return true
  const step = Math.max(1, Math.ceil(total / 10))
  return Math.floor(done / step) > Math.floor(lastAnnounced / step)
}

/**
 * הסיכום בסוף פעולה מרובה.
 * @param {'release' | 'download'} action
 * @param {{ done: number, failed?: number, stopped?: number, skipped?: number, fatal?: string, partialFile?: boolean }} counts
 *   skipped — דולגו כי השתנו (הבדיקה לפני שליחה); fatal — השגיאה שעצרה את הריצה (התחברות שפגה, אין הרשאה): הסיכום
 *   אומר גם כמה כבר הושלמו; partialFile — בהורדה: ירד קובץ עם חלק מהנבחרים.
 */
export function bulkResultText(action, { done, failed = 0, stopped = 0, skipped = 0, fatal = '', partialFile = false }) {
  const what = action === 'release'
    ? (done === 1 ? 'עמוד אחד שוחרר' : `${formatNumber(done)} עמודים שוחררו`)
    : (done === 1 ? 'הטקסט של עמוד אחד ירד' : `הטקסט של ${formatNumber(done)} עמודים ירד`)
  const parts = [done > 0 ? what : action === 'release' ? 'לא שוחרר אף עמוד' : 'לא ירד אף עמוד']
  if (partialFile && done > 0) parts[0] += ' (קובץ חלקי)'
  const skip = action === 'release' ? skippedText(skipped) : ''
  if (skip) parts.push(skip)
  if (fatal) {
    const rest = failed + stopped
    if (rest > 0) parts.push(`${rest === 1 ? 'עמוד אחד לא הושלם' : `${formatNumber(rest)} לא הושלמו`}: ${String(fatal).replace(/\.$/, '')}`)
    else parts.push(String(fatal).replace(/\.$/, ''))
  } else {
    if (failed > 0) parts.push(failed === 1 ? 'עמוד אחד נכשל' : `${formatNumber(failed)} נכשלו`)
    if (stopped > 0) parts.push(stopped === 1 ? 'עמוד אחד לא נשלח (עצרת)' : `${formatNumber(stopped)} לא נשלחו (עצרת)`)
  }
  const tail = failed + stopped > 0 ? ' מה שלא הושלם נשאר מסומן.' : ''
  return { message: `${parts.join('. ')}.${tail}`, tone: failed > 0 || fatal ? 'error' : 'success' }
}

// ----- טעינה -----

/** כמה עמודים השרת מחזיר בבקשה אחת (api/admin/pages/list, ברירת המחדל של limit) */
export const SERVER_LIMIT = 5000

/** בזמן הטעינה, כשיש יותר מבקשה אחת: "טוען… 10,000 מתוך 14,617" */
export function loadProgressText(loaded, total) {
  return `טוען… ${formatNumber(loaded)} מתוך ${formatNumber(total)}`
}

/**
 * אחרי שכל ההמשכים נטענו ועדיין חסר (מעל התקרה MAX_LOADED) — שורה שקטה ליד המונה; אחרת null. total סופר גם
 * עמודים של ספר שנמחק, שהשרת לא מחזיר — לכן ההשוואה מול מה שנבדק (בקשות × 5,000), לא מול מה שהגיע.
 * @param {number} total כמה יש בשרת לסינון הזה @param {number} checked כמה נבדקו
 */
export function partialLoadNote(total, checked) {
  if (!(total > checked)) return null
  return {
    text: `נבדקו ${formatNumber(checked)} מתוך ${formatNumber(total)}`,
    title: `השרת שולח את העמודים לפי סדר ההוספה של הספרים, ונטענו רק ${formatNumber(checked)} הראשונים. עמודים בספרים שנוספו מאוחר לא מופיעים כאן. כדי לבדוק ספר מסוים, בחר אותו.`,
  }
}

// ----- הורדה -----

/** מעל זה "הורד טקסט של כל N" שואל קודם — הקובץ נבנה בשרת, ויכול לקחת זמן */
export const DOWNLOAD_ALL_CONFIRM_ABOVE = 1000

export function downloadAllConfirm(total) {
  return {
    title: `להוריד את הטקסט של ${formatNumber(total)} עמודים?`,
    body: 'השרת יבנה קובץ אחד עם כל העמודים. זה יכול לקחת כמה דקות, והקובץ יכול להיות גדול.',
    confirmLabel: 'הורד',
    tone: 'default',
  }
}

/** מכמה עמודים מאותו ספר "הורד טקסט" מבקש את כל הספר בקובץ אחד (במקום בקשה לכל עמוד) */
export const WHOLE_BOOK_FROM = 10
