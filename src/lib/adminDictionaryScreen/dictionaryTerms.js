// "הצעות למילון" — הניסוחים שמוצגים במסך, ומקשי הקיצור של הרשימה. לוגיקה טהורה (נבדק ב-dictionaryTerms.test.mjs).

import { formatNumber } from '../adminTerms.js'
import { adminScreenTitle } from '../adminNav.js'
import { bulkProgressText as bulkProgressLine } from '../adminList/bulkText.js'

export const DICTIONARY_TITLE = adminScreenTitle('dictionary')
export const DICTIONARY_DESCRIPTION = 'מילים שמשתמשים הוסיפו למילון האישי של בדיקת האיות בעורך. מילה שתאשר תיכנס למילון הכללי, ולא תסומן יותר כשגיאה אצל אף אחד.'

/** ההבדל בין "דלג" ל"הסר" — שורה אחת מתחת לתיאור */
export const ACTIONS_HINT = '"דלג" — לא עכשיו: המילה נשארת אצל המשתמשים, ותחזור לכאן אם משתמש נוסף יוסיף אותה. "הסר" — המילה שגויה: היא תימחק מהמילון האישי של מי שהוסיף אותה.'

export const VIEW_LABELS = { pending: 'ממתינות', skipped: 'דולגו' }

/** "מילה אחת" / "12 מילים" */
export function wordsCountText(n) {
  return n === 1 ? 'מילה אחת' : `${formatNumber(n)} מילים`
}

/** "משתמש אחד" / "3 משתמשים" */
export function usersCountText(n) {
  return n === 1 ? 'משתמש אחד' : `${formatNumber(n)} משתמשים`
}

/** בשורה, לפני שהבקשה יוצאת (ליד "בטל"; ההסבר המלא — בהודעה הקופצת) */
export const PENDING_LINE = {
  approve: 'נכנסת למילון…',
  skip: 'מדלג…',
  remove: 'מסיר…',
}

/** הסימון שנשאר בשורה אחרי שהפעולה הצליחה (עד הרענון הבא) */
export const DONE_LINE = {
  approve: 'נוספה למילון',
  skip: 'דולגה',
  remove: 'הוסרה',
}

/** "של המשתמש" / "של כל 3 המשתמשים" — כשהפעולה על המילה נוגעת בכמה משתמשים, זה נאמר במפורש */
export function whoseText(n) {
  return n > 1 ? `של כל ${formatNumber(n)} המשתמשים` : 'של המשתמש'
}

/** ההודעה הקופצת לפני שהבקשה יוצאת; n — כמה משתמשים הפעולה נוגעת בהם */
export function pendingToast(action, word, n = 1) {
  if (action === 'approve') return `"${word}" תיכנס למילון הכללי ותצא מהמילון האישי ${whoseText(n)} בעוד כמה שניות.`
  if (action === 'skip') return n > 1 ? `"${word}" תדולג אצל כל ${formatNumber(n)} המשתמשים בעוד כמה שניות.` : `"${word}" תדולג בעוד כמה שניות.`
  return `"${word}" תוסר מהמילון האישי ${whoseText(n)} בעוד כמה שניות.`
}

/** "הסר" בתפריט של המילה */
export const removeLabel = (n) => `הסר מהמילון האישי ${whoseText(n)}`

/** תווית "אשר" לקורא המסך */
export const approveAriaLabel = (word, n) => `אשר את "${word}" — הוסף למילון הכללי${n > 1 ? ` (לכל ${formatNumber(n)} המשתמשים)` : ''}`

/** ההודעה הקופצת אחרי שהבקשה הצליחה */
export function doneToast(action, word) {
  if (action === 'approve') return `"${word}" נוספה למילון הכללי.`
  if (action === 'skip') return `"${word}" דולגה.`
  return `"${word}" הוסרה מהמילון האישי של המשתמשים.`
}

// ----- פעולה על משתמש אחד (ברשימה "מי הוסיף") — כמו כל שורה במסך הקודם -----

/** אחרי שהפעולה על משתמש אחד הצליחה */
export function userDoneToast(action, word, name) {
  if (action === 'approve') return `"${word}" נוספה למילון הכללי, ויצאה מהמילון האישי של ${name}.`
  if (action === 'skip') return `"${word}" דולגה אצל ${name}.`
  return `"${word}" הוסרה מהמילון האישי של ${name}.`
}

/** כשל בפעולה על משתמש אחד */
export function userFailedToast(action, word, name) {
  const verb = { approve: 'להוסיף את', skip: 'לדלג על', remove: 'להסיר את' }[action] || 'לעדכן את'
  return `לא הצלחנו ${verb} "${word}" אצל ${name}.`
}

/** חלון האישור לפני הסרה ממשתמש אחד (כמו במסך הקודם) */
export function removeUserConfirm(word, name) {
  return {
    title: `להסיר את "${word}" מהמילון האישי של ${name}?`,
    body: 'המילה תימחק מהמילון האישי שלו בלבד. משתמשים אחרים שהוסיפו אותה לא יושפעו.',
    confirmLabel: 'הסר',
    cancelLabel: 'בטל',
    tone: 'danger',
  }
}

export const CANCELLED_TOAST = 'הפעולה בוטלה.'

/** כשל בפעולה על מילה; partial — חלק מהמשתמשים כבר עודכנו */
export function failedToast(action, word, partial) {
  const verb = { approve: 'להוסיף את', skip: 'לדלג על', remove: 'להסיר את' }[action] || 'לעדכן את'
  return partial
    ? `לא הצלחנו ${verb} "${word}" אצל כל המשתמשים. הרשימה עודכנה — נסה שוב.`
    : `לא הצלחנו ${verb} "${word}".`
}

/** "מוסיף… 3 מתוך 12" — בזמן פעולה מרובה */
export function bulkProgressText(action, { done, total }) {
  return bulkProgressLine(action === 'approve' ? 'מוסיף למילון' : 'מדלג', { done, total })
}

/** הסיכום אחרי פעולה מרובה */
export function bulkResultText(action, { ok, failed, stopped }) {
  const done = action === 'approve' ? `${wordsCountText(ok)} נוספו למילון` : `${wordsCountText(ok)} דולגו`
  const one = action === 'approve' ? 'מילה אחת נוספה למילון' : 'מילה אחת דולגה'
  const head = ok === 1 ? one : done
  const parts = [ok > 0 ? head : action === 'approve' ? 'לא נוספו מילים' : 'לא דולגו מילים']
  if (failed > 0) parts.push(failed === 1 ? 'מילה אחת לא עודכנה ונשארה מסומנת' : `${formatNumber(failed)} לא עודכנו ונשארו מסומנות`)
  if (stopped) parts.push('הפעולה נעצרה')
  return `${parts.join(' · ')}.`
}

/** חלון האישור לפני "אשר" על כמה מילים */
export function bulkApproveConfirm(n) {
  return {
    title: n === 1 ? 'להוסיף מילה אחת למילון הכללי?' : `להוסיף ${formatNumber(n)} מילים למילון הכללי?`,
    body: 'המילים ייכנסו למילון הכללי, ויוסרו מהמילון האישי של כל מי שהוסיף אותן.',
    confirmLabel: n === 1 ? 'הוסף למילון' : `הוסף ${formatNumber(n)} מילים`,
    cancelLabel: 'בטל',
  }
}

/**
 * מקשי הקיצור ברשימה (כשהפוקוס בשורה, לא בשדה טקסט): ↓ / J — המילה הבאה, ↑ / K — הקודמת, A — אשר, S — דלג.
 * לפי המקש הפיזי (code), כך שזה עובד גם במקלדת עברית. עם Ctrl / Alt / ⌘ — לא שלנו.
 * @param {{ key?: string, code?: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} event
 * @returns {'next' | 'prev' | 'approve' | 'skip' | null}
 */
export function rowKeyAction(event) {
  if (!event || event.ctrlKey || event.metaKey || event.altKey) return null
  if (event.key === 'ArrowDown' || event.code === 'KeyJ') return 'next'
  if (event.key === 'ArrowUp' || event.code === 'KeyK') return 'prev'
  if (event.code === 'KeyA') return 'approve'
  if (event.code === 'KeyS') return 'skip'
  return null
}

export const KEYBOARD_HINT = 'במקלדת: ↑ ↓ בין המילים, A — אשר, S — דלג.'
