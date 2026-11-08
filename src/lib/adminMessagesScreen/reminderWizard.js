// "הודעות › תזכורות" — האשף (ספר → נמענים → תוכן ושליחה): אילו ספרים מוצגים, מתי אפשר להמשיך, הבקשה
// לשרת ואזהרת הכפילות. לוגיקה טהורה (נבדק ב-reminderWizard.test.mjs). איתור הנמענים וה-HTML של המייל —
// ב-reminderUtils.js, בלי שינוי.
//
// הבקשה לשרת זהה לזו של המסך הקודם (admin/reminders/page.jsx): POST /api/admin/send-email עם אותם שדות,
// אותו נושא ואותו טקסט ברירת מחדל.

import { formatTimeAgo } from './reminderUtils.js'
import { formatNumber } from '../adminTerms.js'

export const DEFAULT_REMINDER_MESSAGE = 'שמנו לב כי ישנם עמודים שתפסת לעריכה וטרם הושלמו.\nנודה לך מאוד אם תוכל להיכנס למערכת ולהשלים את העבודה עליהם בהקדם, כדי שנוכל לקדם את הספר לפרסום לטובת הכלל.\nלחילופין, אם לא תוכל לסיים כרגע, נא לשחרר את העמודים ע"מ שאחרים יוכלו לסיים אותם.'

export const REMINDER_STEPS = [
  { id: 'book', label: 'ספר' },
  { id: 'recipients', label: 'נמענים' },
  { id: 'content', label: 'תוכן ושליחה' },
]

/**
 * הספרים שאפשר לשלוח עליהם תזכורת: לא מוסתרים, ויש בהם עמודים בעבודה. הנמענים הם רק מי שתפס עמוד שעדיין בעבודה
 * (reminderUtils.computeRegularRecipients), ולכן ספר בלי עמודים בעבודה תמיד היה מוביל ל"אין למי לשלוח" — הוא לא
 * מוצג (קודם הוצגו גם ספרים שרק "לא הושלמו").
 */
export function booksWithWork(books) {
  return (books || []).filter((book) => !book.isHidden && Number(book.inProgressPages) > 0)
}

/** האפשרויות לבורר הספר: השם, ומתחת — הקטגוריה וכמה עמודים בעבודה */
export function bookOptions(books) {
  return (books || []).map((book) => {
    const working = Number(book.inProgressPages) || 0
    const parts = [book.category, working === 1 ? 'עמוד אחד בעבודה' : working > 0 ? `${formatNumber(working)} עמודים בעבודה` : 'אין עמודים בעבודה']
    return { value: book.path, label: book.name, description: parts.filter(Boolean).join(' · ') }
  })
}

/**
 * האם אפשר לעבור מהשלב: ספר — נבחר ספר; נמענים — האיתור הסתיים ויש לפחות נמען אחד; תוכן — יש טקסט.
 * @param {string} step
 * @param {{ bookPath?: string, checking?: boolean, recipients?: string[], message?: string }} state
 */
export function canAdvance(step, state) {
  if (step === 'book') return Boolean(state.bookPath)
  if (step === 'recipients') return !state.checking && (state.recipients?.length || 0) > 0
  if (step === 'content') return Boolean(String(state.message || '').trim()) && (state.recipients?.length || 0) > 0
  return false
}

/** נשלחה רק לחלק מהעורכים שנמצאו (כמו קודם: פחות נבחרו ממה שנמצא) */
export function isPartialSend(recipients, found) {
  return (recipients?.length || 0) < (found?.length || 0)
}

/** הנושא של המייל (קודם: "הודעה מערכת" — שגיאת כתיב; תוקן ל"הודעת מערכת") */
export function reminderSubject(bookName) {
  return `הודעת מערכת בנוגע לספר "${bookName}"`
}

/** בשלב "ספר", מתחת לבורר: כמה עורכים יקבלו ('' כשלא נבחר ספר) */
export function editorsFoundText({ bookPath, checking, found, error }) {
  if (!bookPath) return ''
  if (checking) return 'בודק מי עובד על הספר…'
  if (error) return ''
  const n = found?.length || 0
  if (n === 0) return 'אף עורך שעובד על הספר לא מאשר תזכורות — אין למי לשלוח.'
  return n === 1 ? 'עורך אחד עובד על הספר ומאשר תזכורות.' : `${formatNumber(n)} עורכים עובדים על הספר ומאשרים תזכורות.`
}

/**
 * השליחה נכשלה בלי תשובה מהשרת (תקרת זמן, ניתוק, או שער שוויתר — 502/504): ייתכן שהשרת המשיך ושלח. אחרי כשל כזה — ההיסטוריה נטענת
 * מחדש, ו"נסה שוב" עובר קודם דרך uncertainConfirm, כדי שלא יישלח דואר פעמיים בטעות.
 */
export const isUncertainFailure = (error) => [0, 408, 502, 504].includes(error?.status)

export const UNCERTAIN_SEND_TEXT = 'ייתכן שהתזכורת בכל זאת יצאה. בדוק ב"תזכורות שנשלחו" לפני שתנסה שוב.'

export function uncertainConfirm(bookName) {
  return {
    title: 'ייתכן שהתזכורת כבר יצאה',
    body: `השליחה הקודמת על "${bookName}" לא קיבלה תשובה מהשרת, ואולי בכל זאת נשלחה.`,
    details: ['בדוק ב"תזכורות שנשלחו". אם היא לא שם — שלח שוב.'],
    confirmLabel: 'שלח שוב',
  }
}

/**
 * גוף הבקשה ל-POST /api/admin/send-email — אותם שדות ובאותו סדר כמו קודם.
 * @param {{ recipients: string[], bookName: string, bookPath: string, message: string, html: string, isPartial: boolean }} input
 */
export function sendEmailBody({ recipients, bookName, bookPath, message, html, isPartial }) {
  return {
    bcc: recipients,
    subject: reminderSubject(bookName),
    html,
    text: message,
    bookName,
    bookPath,
    isPartial,
  }
}

/**
 * אם התזכורת האחרונה שיצאה הייתה על אותו ספר — חלון "לשלוח שוב?" (כמו קודם), אחרת null.
 * @param {any[]} history  מהחדשה לישנה (כמו ש-/api/admin/history מחזיר)
 */
export function duplicateConfirm(history, bookName) {
  const last = history?.[0]
  if (!last || last.bookName !== bookName) return null
  return {
    title: 'לשלוח שוב תזכורת על הספר הזה?',
    body: `התזכורת האחרונה שיצאה (${formatTimeAgo(last.timestamp)}) הייתה גם היא על "${bookName}".`,
    confirmLabel: 'שלח שוב',
  }
}

/** ההודעה אחרי שליחה: כמה קיבלו, ומה השרת סינן (לפי details של התשובה, כשיש) */
export function sentResultText(requested, details) {
  const ok = Number(details?.successful)
  const failed = Number(details?.failed) || 0
  const filtered = Number(details?.filteredOut) || 0
  const sent = Number.isFinite(ok) ? ok : requested
  const parts = [sent === 1 ? 'התזכורת נשלחה לעורך אחד בדואר' : `התזכורת נשלחה ל-${formatNumber(sent)} עורכים בדואר`]
  if (failed > 0) parts.push(failed === 1 ? 'שליחה אחת נכשלה' : `${formatNumber(failed)} שליחות נכשלו`)
  if (filtered > 0) parts.push(filtered === 1 ? 'עורך אחד לא קיבל (לא מאשר תזכורות, או שהחשבון לא אומת)' : `${formatNumber(filtered)} עורכים לא קיבלו (לא מאשרים תזכורות, או שהחשבון לא אומת)`)
  return `${parts.join('. ')}.`
}
