// "הצעות עריכה" — הניסוח שהמשתמש רואה: מונים, הודעות אחרי פעולה, חלונות אישור והודעות התנגשות.
// לוגיקה טהורה (נבדק ב-suggestionTerms.test.mjs). בלי ז'רגון: "חלק" (לא "מקטע"), "הטקסט בספר
// השתנה" (לא "קונפליקט"), ובלי המילה "תור".

import { formatNumber } from '../adminTerms.js'
import { partsTruncated, suggestionBookName } from './suggestionsQuery.js'
import { bulkProgressText as bulkProgressLine } from '../adminList/bulkText.js'

export const quoted = (text) => `"${text || ''}"`

/** "הצעה אחת" / "12 הצעות" */
export function suggestionsCountText(n) {
  return n === 1 ? 'הצעה אחת' : `${formatNumber(n)} הצעות`
}

/** "חלק אחד" / "3 חלקים" */
export function partsText(n) {
  return n === 1 ? 'חלק אחד' : `${formatNumber(n)} חלקים`
}

/**
 * שורת הפרטים: כמה חלקים, ובהצעה שטופלה בחלקה — כמה עוד ממתינים. השרת שולח עד 50 חלקים; בהצעה ארוכה
 * יותר אי אפשר לספור את הממתינים, ולכן "80 חלקים, חלק מהם כבר טופלו".
 */
export function partsSummary(edit, pending) {
  const loaded = (edit?.changes || []).length
  const total = edit?.changeCount ?? loaded
  if (total === 0) return 'אין שינויים להצגה'
  const someHandled = pending < loaded
  if (partsTruncated(edit)) return someHandled ? `${partsText(total)}, חלק מהם כבר טופלו` : partsText(total)
  if (pending > 0 && someHandled) return `${formatNumber(pending)} מתוך ${partsText(total)} ממתינים`
  return partsText(total)
}

const nameOf = (edit) => quoted(suggestionBookName(edit))

/**
 * ההודעה אחרי אישור / דחייה של הצעה אחת. status — מה שהשרת החזיר: nochange — אושרה, אבל הטקסט בספר כבר
 * היה כך; book-missing — הספר נמחק, וההצעה נסגרה בלי שנכנס דבר (לא "נכנסה לספר").
 * @returns {{ message: string, tone: 'success' | 'info' }}
 */
export function decidedMessage(action, edit, status) {
  const name = nameOf(edit)
  if (action === 'reject') return { message: `ההצעה ל${name} נדחתה`, tone: 'success' }
  if (status === 'book-missing') return { message: `הספר ${name} כבר לא קיים, ולכן ההצעה נסגרה בלי שינוי`, tone: 'info' }
  if (status === 'nochange') return { message: `ההצעה ל${name} אושרה. הטקסט בספר כבר היה כך`, tone: 'success' }
  return { message: `ההצעה ל${name} אושרה ונכנסה לספר`, tone: 'success' }
}

/** הצעה שמישהו אחר כבר אישר או דחה (השרת: not-pending) */
export const NOT_PENDING_MESSAGE = 'ההצעה כבר לא ממתינה. ייתכן שמישהו אחר טיפל בה'

/** אישור חלקים שהשרת לא שינה בהם דבר (noop): מישהו אחר הכריע עליהם באותו רגע */
export const PARTS_NOOP_MESSAGE = 'החלקים שבחרת כבר טופלו. הרשימה מתעדכנת'

/** "דחה" בכרטיס: ההודעה עם "בטל", לפני שהבקשה יוצאת */
export function rejectPendingMessage(edit) {
  return `ההצעה ל${nameOf(edit)} תידחה`
}
export const REJECT_CANCELLED_MESSAGE = 'הדחייה בוטלה'

/** בתוך הכרטיס, עד שהדחייה נשלחת */
export const REJECT_PENDING_LINE = 'ההצעה תידחה בעוד כמה שניות'

/**
 * ההודעה בתוך הכרטיס כשאישור לא הצליח כי הטקסט בספר השתנה. ההצעה נשארת ממתינה (השרת מחזיר אותה);
 * בהצעה עם כמה חלקים — אפשר לאשר רק את מה שעדיין מתאים.
 * @param {boolean} [many]
 */
export function conflictNotice(many = false) {
  return {
    title: 'ההצעה לא אושרה, והיא עדיין ממתינה',
    body: `הטקסט בספר השתנה מאז שההצעה נשלחה, ולכן אי אפשר להכניס אותה אוטומטית. אפשר לפתוח את הספר ולתקן ביד, ואחר כך לדחות את ההצעה.${many ? ' אפשר גם לסמן רק את החלקים שעדיין מתאימים ולאשר אותם.' : ''}`,
  }
}
export const CONFLICT_NOTICE = conflictNotice(false)

/** הודעה קופצת קצרה כשאישור לא הצליח — ההסבר המלא בכרטיס (שם הוא נשאר) */
export function conflictToast(edit) {
  return `ההצעה ל${nameOf(edit)} לא אושרה: הטקסט בספר השתנה. ההסבר בכרטיס`
}

/** במקום "עדכון מקבילי, נסה שוב" של השרת (409 RETRY) */
export const RETRY_MESSAGE = 'מישהו אחר עדכן את הספר באותו רגע. נסה שוב.'

/** אחרי שגיאת הרשאה או התחברות שפגה באמצע עבודה: הפעולות במסך ננעלות, ומעל הרשימה — ההסבר */
export function lockedNotice(error) {
  if (error?.sessionExpired) return { title: 'פג תוקף ההתחברות', body: 'התחבר מחדש כדי להמשיך לאשר ולדחות הצעות.' }
  return { title: 'אין לך עוד הרשאה לאשר או לדחות הצעות', body: 'ייתכן שההרשאה שלך השתנתה. רענן את הדף, ואם זו טעות — פנה למנהל האתר.' }
}

/** שורת הכפתורים כשמסומנים חלקים: "אשר 2 חלקים" / "דחה חלק אחד" */
export function partsActionLabel(kind, count) {
  return `${kind === 'approve' ? 'אשר' : 'דחה'} ${partsText(count)}`
}

/** אחרי אישור חלקים שחלקם לא נכנסו: כמה לא נכנסו, ושהם נשארו ממתינים */
export function partsConflictNotice(conflicts) {
  const one = conflicts === 1
  return {
    title: one ? 'חלק אחד לא אושר' : `${formatNumber(conflicts)} חלקים לא אושרו`,
    body: one
      ? 'הטקסט בספר השתנה מאז שההצעה נשלחה, ולכן החלק לא נכנס אוטומטית. הוא נשאר ממתין בהצעה.'
      : 'הטקסט בספר השתנה מאז שההצעה נשלחה, ולכן החלקים לא נכנסו אוטומטית. הם נשארו ממתינים בהצעה.',
  }
}

/** ההודעה אחרי אישור / דחייה של חלקים נבחרים בהצעה */
export function partsDecidedMessage({ approved = 0, rejected = 0 }) {
  const out = []
  if (approved > 0) out.push(approved === 1 ? 'חלק אחד אושר' : `${formatNumber(approved)} חלקים אושרו`)
  if (rejected > 0) out.push(rejected === 1 ? 'חלק אחד נדחה' : `${formatNumber(rejected)} חלקים נדחו`)
  return out.length > 0 ? out.join(' · ') : 'לא השתנה דבר'
}

/** מה הפעולה המרובה עושה עכשיו: "מאשר… 3 מתוך 12" */
export function bulkProgressText(action, { done, total }) {
  return bulkProgressLine(action === 'approve' ? 'מאשר' : 'דוחה', { done, total })
}

/**
 * הסיכום בסוף פעולה מרובה: "אושרו 8 · 1 לא אושרה כי הטקסט בספר השתנה · 2 לא עודכנו. נסה שוב."
 * done — הצליחו; conflicts — לא אושרו כי הטקסט השתנה (נשארות ברשימה, עם הסבר בכרטיס); gone — כבר לא
 * ממתינות (השרת לא מצא אותן ממתינות); failed — לא עודכנו: הבקשה נכשלה, או שהשרת דילג (skipped — כשל אצלו,
 * למשל עומס; ההצעה חזרה להמתנה); stopped — לא נשלחו כי לחצת "עצור".
 */
export function bulkResultText(action, { done = 0, conflicts = 0, gone = 0, failed = 0, stopped = 0 }) {
  const parts = []
  if (done > 0) {
    const verb = action === 'approve' ? (done === 1 ? 'אושרה' : 'אושרו') : (done === 1 ? 'נדחתה' : 'נדחו')
    parts.push(`${suggestionsCountText(done)} ${verb}`)
  }
  if (conflicts > 0) parts.push(conflicts === 1 ? 'הצעה אחת לא אושרה כי הטקסט בספר השתנה, והיא נשארה ברשימה' : `${formatNumber(conflicts)} לא אושרו כי הטקסט בספר השתנה, והן נשארו ברשימה`)
  if (gone > 0) parts.push(gone === 1 ? 'הצעה אחת כבר לא ממתינה' : `${formatNumber(gone)} כבר לא ממתינות`)
  if (failed > 0) parts.push(`${failed === 1 ? 'הצעה אחת לא עודכנה' : `${formatNumber(failed)} לא עודכנו`}. נסה שוב`)
  if (stopped > 0) parts.push(`נעצר: ${stopped === 1 ? 'הצעה אחת לא נשלחה' : `${formatNumber(stopped)} לא נשלחו`}`)
  const tone = failed > 0 ? 'error' : conflicts > 0 || stopped > 0 || gone > 0 || done === 0 ? 'info' : 'success'
  return { message: parts.length > 0 ? `${parts.join(' · ')}.` : 'לא השתנה דבר.', tone }
}

/** "דחה נבחרים" — הרסני: ההצעות לא חוזרות (המציע יכול לשלוח שוב) */
export function bulkRejectConfirm(count) {
  return {
    title: count === 1 ? 'לדחות את ההצעה?' : `לדחות ${suggestionsCountText(count)}?`,
    body: 'הטקסט בספרים לא ישתנה. אי אפשר להחזיר הצעה שנדחתה; מי שהציע יכול לשלוח אותה שוב.',
    confirmLabel: count === 1 ? 'דחה' : `דחה ${formatNumber(count)}`,
    tone: 'danger',
  }
}

/** "אשר את כל ההחלפות הזהות" — כל ההצעות הממתינות של אותו חיפוש והחלפה, בכל הספרים */
export function approvePatternConfirm(findReplace) {
  return {
    title: 'לאשר את כל ההחלפות הזהות?',
    body: `כל ההצעות שממתינות להחליף ${quoted(findReplace?.find)} ב${findReplace?.replace ? quoted(findReplace.replace) : 'כלום (מחיקה)'} יאושרו, בכל הספרים.`,
    details: ['הצעה שהטקסט בספר שלה השתנה — לא תאושר, ותישאר ממתינה.'],
    confirmLabel: 'אשר את כולן',
  }
}

/** ההודעה אחרי "אשר את כל ההחלפות הזהות" (התשובה של השרת: approved, conflicts) */
export function patternResultText({ approved = 0, conflicts = 0 }) {
  return bulkResultText('approve', { done: approved, conflicts })
}

/** חלון החסימה: מה קורה, ואיפה מבטלים */
export const BLOCK_EXPLANATION = 'הוא לא יוכל להציע עוד עריכות לספרים. מנהל כללי יכול לבטל את החסימה במסך "משתמשים".'

/** ההודעה אחרי חסימת משתמש מעריכה (rejected — כמה הצעות שלו נדחו יחד איתה) */
export function blockedMessage(name, rejected = 0) {
  const base = `${name || 'המשתמש'} נחסם מעריכה.`
  return rejected > 0 ? `${base} ${rejected === 1 ? 'הצעה אחת שלו נדחתה' : `${formatNumber(rejected)} הצעות שלו נדחו`}.` : base
}
