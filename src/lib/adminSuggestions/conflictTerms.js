// "התנגשויות בסנכרון" (/library/dicta-edit/conflicts) — הניסוח. לוגיקה טהורה (conflictTerms.test.mjs).
//
// המשתמש לא מתכנת: "GitHub" מופיע פעם אחת, עם הסבר ("המאגר המרכזי (GitHub)") — בשורת ההסבר של המסך;
// בכל מקום אחר — "המאגר". בלי "סנכרון", "קונפליקט", "דחיפה" בטקסט שבתוך המסך.
// חריג אחד: שם המסך עצמו, "התנגשויות בסנכרון" — נקבע במילון השמות של הניהול (כמו בלוח ובסרגל), ולכן
// הוא נשאר. ההסבר שמתחתיו אומר במילים פשוטות מה זה.
// strategy — כמו בשרת: 'ours' = הנוסח שבאתר נשאר; 'theirs' = הנוסח שבמאגר נשאר.

import { formatNumber } from '../adminTerms.js'
import { adminScreenTitle } from '../adminNav.js'
import { bookName } from './suggestionsQuery.js'

export const CONFLICTS_TITLE = adminScreenTitle('conflicts')
export const CONFLICTS_DESCRIPTION = 'ספרים ששונו גם באתר וגם במאגר המרכזי (GitHub) מאז העדכון האחרון ביניהם. כאן בוחרים איזה נוסח נשאר.'

export const SIDE_LABELS = { theirs: 'הנוסח שבמאגר', ours: 'הנוסח שבאתר' }
export const KEEP_LABELS = { theirs: 'השאר את הנוסח שבמאגר', ours: 'השאר את הנוסח שבאתר' }

/** שם הספר בשורה: הכותרת, ואם אין — מתוך הנתיב */
export function conflictBookName(book) {
  return book?.title || bookName(book?.path) || 'ספר בלי שם'
}

/** השורה מעל החלקים, בספר פתוח: מה עושים, מה קורה לנוסח השני, ומה עושים כשלא בטוחים */
export const CONFLICT_PANEL_HINT = 'בכל חלק בחר איזה נוסח נשאר. הנוסח השני יימחק, ואחרי שהבחירה נשמרת אי אפשר להחזיר אותו. לא בטוח? פתח את הספר בעורך ובדוק את ההקשר.'

/** הודעה עם "בטל" אחרי בחירה בחלק — הבקשה יוצאת רק אחרי כמה שניות */
export function partPendingMessage(book, number, side) {
  return `חלק ${formatNumber(number)} ב"${conflictBookName(book)}": יישאר ${SIDE_LABELS[side]}`
}

/** במקום "עומס עדכונים מקבילים על הספר" של השרת (409) */
export const CONFLICT_RETRY_MESSAGE = 'מישהו אחר עדכן את הספר באותו רגע. נסה שוב.'

/** "חלק אחד שונה" / "3 חלקים שונים" */
export function conflictPartsText(n) {
  return n === 1 ? 'חלק אחד שונה' : `${formatNumber(n)} חלקים שונים`
}

/** "ספר אחד מחכה להחלטה" / "3 ספרים מחכים להחלטה" */
export function conflictsCountText(n) {
  return n === 1 ? 'ספר אחד מחכה להחלטה' : `${formatNumber(n)} ספרים מחכים להחלטה`
}

/** חלון האישור לפעולה על כל הספר — אי אפשר לבטל: הנוסח השני נמחק */
export function resolveBookConfirm(book, strategy) {
  const name = `"${conflictBookName(book)}"`
  const ours = strategy === 'ours'
  return {
    title: ours ? 'להשאיר בכל הספר את הנוסח שבאתר?' : 'להשאיר בכל הספר את הנוסח שבמאגר?',
    body: ours
      ? `בכל החלקים של ${name} יישאר הנוסח שבאתר, ובעדכון הבא הוא יחליף את מה שבמאגר.`
      : `בכל החלקים של ${name} יישאר הנוסח שבמאגר, והוא יחליף את מה שבאתר.`,
    details: [ours ? 'השינויים שנעשו במאגר בספר הזה יימחקו.' : 'העריכות שנעשו באתר בספר הזה, כולל הצעות עריכה שאושרו, יבוטלו.', 'אי אפשר לבטל את זה.'],
    confirmLabel: KEEP_LABELS[strategy],
    tone: 'danger',
  }
}

/** ההודעה אחרי פעולה על כל הספר */
export function resolvedBookMessage(book, strategy) {
  return `ב"${conflictBookName(book)}" נשאר ${SIDE_LABELS[strategy]}`
}
