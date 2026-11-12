// "הודעות" — הניסוח: ספירות, חלונות אישור, הודעות בסוף פעולה, ואיך ההודעה מגיעה (באתר / בדואר).
// לוגיקה טהורה (נבדק ב-messageTerms.test.mjs).
//
// איך מגיעים (מהקוד של השרת, לא הנחה):
//   הודעה ותשובה (send-admin, reply) — נשמרות באתר ומופיעות לנמען באזור האישי. לא נשלח דואר.
//   תזכורת (admin/send-email) — נשלחת בדואר בלבד, ולא נשמרת כהודעה באתר.

import { ageText, formatNumber } from '../adminTerms.js'
import { adminScreenTitle } from '../adminNav.js'
import { ALL_ADMIN_ROLES } from '../roles.js'
import { bulkProgressText as bulkProgressLine } from '../adminList/bulkText.js'

export const MESSAGES_TITLE = adminScreenTitle('messages')
/** שורת ההסבר — "תזכורות" רק למי שרואה אותן */
export const messagesDescription = (canRemind) => (canRemind ? 'פניות של משתמשים לצוות, הודעות שהצוות שלח, ותזכורות לעורכים.' : 'פניות של משתמשים לצוות, והודעות שהצוות שלח.')

export const SITE_DELIVERY = 'ההודעה תופיע באתר, באזור האישי של הנמען. היא לא נשלחת בדואר.'
export const REPLY_DELIVERY = 'התשובה תופיע באתר, באזור האישי שלו. היא לא נשלחת בדואר.'
export const EMAIL_DELIVERY = 'התזכורת נשלחת בדואר בלבד, ולא מופיעה באתר.'

const plural = (n, one, many) => (n === 1 ? one : `${formatNumber(n)} ${many}`)

/** "שיחה אחת" / "12 שיחות" */
export const conversationsText = (n) => plural(n, 'שיחה אחת', 'שיחות')
/** "הודעה אחת" / "12 הודעות" */
export const messagesText = (n) => plural(n, 'הודעה אחת', 'הודעות')
/** "משתמש אחד" / "40 משתמשים" */
export const usersText = (n) => plural(n, 'משתמש אחד', 'משתמשים')
/** "למשתמש אחד" / "ל-40 משתמשים" (בלי מקף לפני מילה) */
export const toUsersText = (n) => (n === 1 ? 'למשתמש אחד' : `ל-${usersText(n)}`)
/** "עורך אחד" / "4 עורכים" */
export const editorsText = (n) => plural(n, 'עורך אחד', 'עורכים')
/** "לעורך אחד" / "ל-4 עורכים" */
export const toEditorsText = (n) => (n === 1 ? 'לעורך אחד' : `ל-${editorsText(n)}`)

/** המונה בלשונית "נכנסות", לקורא המסך: "3 חדשות" */
export const newCountLabel = (n) => (n === 1 ? 'אחת חדשה' : `${formatNumber(n)} חדשות`)

/** "מחק לצמיתות" — שיחה אחת */
export function deleteConfirm(subject) {
  return {
    title: 'למחוק את השיחה לצמיתות?',
    body: subject ? `"${subject}"` : undefined,
    details: ['ההודעה וכל התשובות יימחקו, גם אצל המשתמש.', 'אי אפשר לשחזר אותה.'],
    confirmLabel: 'מחק לצמיתות',
    tone: 'danger',
  }
}

/** "מחק לצמיתות" — כמה שיחות (פעולה מרובה) */
export function bulkDeleteConfirm(count) {
  return {
    title: count === 1 ? 'למחוק לצמיתות שיחה אחת?' : `למחוק לצמיתות ${formatNumber(count)} שיחות?`,
    details: ['ההודעות וכל התשובות יימחקו, גם אצל המשתמשים.', 'אי אפשר לשחזר אותן.'],
    confirmLabel: 'מחק לצמיתות',
    tone: 'danger',
  }
}

/**
 * "מחק לצמיתות" בנשלחו — הודעה לנמען אחד, או לכמה ("כל המשתמשים"). השרת מוחק רק את ההודעות שבשורה (אחת לכל
 * נמען); נמען שהשיב — השיחה שלו בנכנסות, ולא נמחקת (repliedCount מ-groupSent).
 */
export function deleteSentConfirm(group) {
  const n = group?.recipients?.length || 1
  const replied = Number(group?.repliedCount) || 0
  const details = n === 1
    ? ['ההודעה תימחק גם אצל הנמען.']
    : [`ההודעה תימחק אצל ${formatNumber(n)} הנמענים שלא השיבו עליה.`]
  if (replied > 0) details.push(replied === 1 ? 'נמען אחד השיב — השיחה איתו נמצאת בנכנסות ותישאר שם.' : `${formatNumber(replied)} נמענים השיבו — השיחות איתם נמצאות בנכנסות ויישארו שם.`)
  else if (n > 1) details.push('אם מישהו השיב, השיחה איתו נמצאת בנכנסות ותישאר שם.')
  details.push('אי אפשר לשחזר אותה.')
  return {
    title: n === 1 ? 'למחוק את ההודעה לצמיתות?' : `למחוק את ההודעה אצל ${formatNumber(n)} נמענים?`,
    body: group?.subject ? `"${group.subject}"` : undefined,
    details,
    confirmLabel: 'מחק לצמיתות',
    tone: 'danger',
  }
}

/**
 * כמה יקבלו הודעה "לכל המשתמשים" — בדיוק כמו השרת (send-admin: role שאינו מאחד מתפקידי הניהול, כולל מפתח ומי
 * שאין לו תפקיד). מרשימת כל המשתמשים (/api/admin/users — רק למנהל כללי).
 */
export function broadcastAudienceCount(users) {
  return (users || []).filter((u) => !ALL_ADMIN_ROLES.includes(u?.role)).length
}

/** "כל המשתמשים": כמה יקבלו. exact — נספר כמו בשרת (כל מי שאינו מנהל); אחרת — "כ-42" (רק משתמשים רגילים ברשימה) */
export function audienceCountText(count, { exact = false } = {}) {
  if (!Number.isFinite(count)) return ''
  if (count === 0) return 'אין כרגע משתמשים שאינם מנהלים'
  if (exact) return usersText(count)
  return count === 1 ? 'כמשתמש אחד' : `כ-${usersText(count)}`
}

/**
 * אישור לפני שליחה לכל המשתמשים. count — כמה יקבלו (exact: נספר כמו בשרת; אחרת הערכה). המספר בגוף החלון, לא על
 * הכפתור. 0 — אין למי לשלוח (null: לא שולחים).
 */
export function broadcastConfirm(count, { exact = false } = {}) {
  const known = Number.isFinite(count)
  if (known && exact && count === 0) return null
  const to = !known || count <= 0 ? '' : exact ? toUsersText(count) : count === 1 ? 'לכמשתמש אחד' : `לכ-${usersText(count)}`
  const who = to ? `היא תגיע ${to} — כל מי שאינו מנהל.` : 'היא תגיע לכל מי שאינו מנהל.'
  return {
    title: 'לשלוח את ההודעה לכל המשתמשים?',
    body: composeDelivery(true),
    details: [who, 'אחרי השליחה אפשר למחוק אותה מ"נשלחו", אבל מי שכבר ראה אותה — כבר ראה.'],
    confirmLabel: 'שלח לכל המשתמשים',
  }
}

/** אחרי שליחה לכולם: המספר מהתשובה של השרת ("נשלח בהצלחה ל-40 משתמשים"). 0 — לא הגיעה לאף אחד */
export function sentToAllText(serverMessage) {
  const n = Number(String(serverMessage || '').match(/(\d[\d,]*)/)?.[1]?.replace(/,/g, ''))
  if (n === 0) return { message: 'ההודעה לא נשלחה לאף אחד: אין כרגע משתמשים שאינם מנהלים.', tone: 'info' }
  return { message: Number.isFinite(n) && n > 0 ? `ההודעה נשלחה ${toUsersText(n)}` : 'ההודעה נשלחה לכל המשתמשים', tone: 'success' }
}

/** כותרת המשנה של "הודעה חדשה" — איך זה מגיע, לנמען אחד או לכולם */
export const composeDelivery = (toAll) => (toAll ? 'ההודעה תופיע באתר, באזור האישי של כל אחד מהם. היא לא נשלחת בדואר.' : SITE_DELIVERY)

/**
 * מה חסר כדי לשלוח הודעה חדשה — במקום כפתור מושבת בלי הסבר.
 * @returns {{ field: 'user' | 'subject' | 'text', message: string }[]}
 */
export function composeMissing({ toAll, hasUser, subject, text }) {
  const missing = []
  if (!toAll && !hasUser) missing.push({ field: 'user', message: 'בחר למי לשלוח.' })
  if (!String(subject || '').trim()) missing.push({ field: 'subject', message: 'כתוב נושא.' })
  if (!String(text || '').trim()) missing.push({ field: 'text', message: 'כתוב את תוכן ההודעה.' })
  return missing
}

/** בחיפוש: התוצאות בלשונית השנייה ("נמצאו גם 2 בנשלחו") — '' כשאין */
export function alsoFoundText(otherView, n) {
  if (!(n > 0)) return ''
  const where = otherView === 'sent' ? 'בנשלחו' : 'בנכנסות'
  return n === 1 ? `נמצאה גם אחת ${where}` : `נמצאו גם ${formatNumber(n)} ${where}`
}

const VERBS = {
  read: { doing: 'מסמן כנקרא', done: (n) => (n === 1 ? 'שיחה אחת סומנה כנקראה' : `${formatNumber(n)} שיחות סומנו כנקראו`) },
  delete: { doing: 'מוחק', done: (n) => (n === 1 ? 'שיחה אחת נמחקה' : `${formatNumber(n)} שיחות נמחקו`) },
}

/** בזמן פעולה מרובה: "מוחק… 3 מתוך 10" */
export function bulkProgressText(action, { done, total }) {
  return bulkProgressLine(VERBS[action]?.doing || 'מעבד', { done, total })
}

/**
 * ההודעה בסוף פעולה מרובה: כמה הצליחו, כמה לא (נשארו בבחירה, לנסות שוב), כמה לא נשלחו כי נעצר, וב"סמן כנקרא" —
 * כמה כבר היו נקראות (skipped). כך הסכום תמיד שווה למה שנבחר.
 * @returns {{ message: string, tone: 'success' | 'error' | 'info' }}
 */
export function bulkResultText(action, { done = 0, failed = 0, stopped = 0, skipped = 0 }) {
  const parts = []
  if (done > 0) parts.push(VERBS[action].done(done))
  if (skipped > 0) parts.push(skipped === 1 ? 'שיחה אחת כבר הייתה נקראה' : `${formatNumber(skipped)} כבר היו נקראות`)
  if (failed > 0) parts.push(failed === 1 ? 'שיחה אחת נכשלה ונשארה בבחירה' : `${formatNumber(failed)} נכשלו ונשארו בבחירה`)
  if (stopped > 0) parts.push(stopped === 1 ? 'עצרת לפני שיחה אחת (נשארה בבחירה)' : `עצרת לפני ${formatNumber(stopped)} שיחות (נשארו בבחירה)`)
  if (parts.length === 0) parts.push('לא בוצע דבר')
  return { message: `${parts.join('. ')}.`, tone: failed > 0 ? 'error' : done > 0 ? 'success' : 'info' }
}

const CLOCK = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** השעה בשעון ירושלים ("14:05"); תאריך לא תקין — "" */
export function clockText(date) {
  const ms = new Date(date ?? NaN).getTime()
  return Number.isFinite(ms) ? CLOCK.format(ms) : ''
}

/** בשורה: היום — השעה ("14:05"); אחרת — כמו בשאר הניהול ("אתמול", "לפני 3 ימים", תאריך) */
export function shortTimeText(date, now = Date.now()) {
  const age = ageText(date, now)
  return age === 'היום' ? clockText(date) : age
}

/** בשרשור: היום / אתמול / תאריך, עם השעה ("אתמול, 09:12") */
export function longTimeText(date, now = Date.now()) {
  const age = ageText(date, now)
  return age ? `${age}, ${clockText(date)}` : ''
}
