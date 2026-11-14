// הבקשות של "הצעות עריכה" — אותן נקודות קצה, אותן שיטות ואותם גופים בדיוק כמו המסך הקודם (בלי שינוי
// בחוזה). העטיפה (adminRequest) מוסיפה: התחברות שפגה מזוהה, תקרת זמן, והודעת שגיאה בעברית. ההתנגשויות —
// admin/conflicts/conflictsApi.js.
//
// פעולה מרובה ("אשר נבחרים" / "דחה נבחרים") — אותה נקודת קצה מרובה כמו קודם (edits/batch) ובאותו גוף
// ({ action, ids }), אבל הצעה אחת בכל בקשה, בזו אחר זו: כך יש "X מתוך Y", "עצור", ויודעים איזו הצעה לא
// אושרה כי הטקסט השתנה. בשרת (batchModerate) זו הייתה לולאה של אחת-אחת באותו סדר, עם אותה נעילה ואותה
// בדיקת גרסה — כך שהתוצאה לכל הצעה זהה. שימו לב: skipped בתשובה אינו "טופלה בידי מישהו אחר" — השרת סופר
// שם גם כשל אצלו (למשל עומס: RETRY אחרי כמה ניסיונות, וההצעה חזרה להמתנה) וגם ספר שנמחק. הצעה שכבר לא
// ממתינה לא נספרת בכלל (כל המונים 0). לכן skipped נחשב אצלנו "לא עודכנה, נסה שוב" (useSuggestionActions).
import { requestJson } from '@/components/admin/list/adminRequest'
import { RETRY_MESSAGE } from '@/lib/adminSuggestions/suggestionTerms'

/** 409 עם code RETRY ("עדכון מקבילי, נסה שוב") — במילים פשוטות */
async function friendly(promise) {
  try {
    return await promise
  } catch (error) {
    if (error?.status === 409) error.message = RETRY_MESSAGE
    throw error
  }
}

export const listSuggestions = () => requestJson('/api/library/edits?status=pending', {
  fallback: 'לא הצלחנו לטעון את הצעות העריכה.',
})

/**
 * אישור / דחייה של ההצעה כולה. note — כמו קודם: לא נשלח (undefined נשמט מה-JSON).
 * keepalive — בסגירת הדף (useDeferredActions)
 */
export const decideSuggestion = (id, action, note, { keepalive = false } = {}) => friendly(requestJson(`/api/library/edits/${id}`, {
  method: 'POST',
  body: { action, note },
  fallback: action === 'approve' ? 'לא הצלחנו לאשר את ההצעה.' : 'לא הצלחנו לדחות את ההצעה.',
  timeoutMs: 60000,
  keepalive,
}))

/** אישור חלקי: { approve: [idx] } או { reject: [idx] } */
export const moderateParts = (id, payload) => friendly(requestJson(`/api/library/edits/${id}`, {
  method: 'POST',
  body: { action: 'moderate-changes', ...payload },
  fallback: 'לא הצלחנו לעדכן את החלקים שנבחרו.',
  timeoutMs: 60000,
}))

/** הצעה אחת דרך נקודת הקצה המרובה. התשובה: { approved, rejected, conflicts, skipped } */
export const batchDecideOne = (action, id) => friendly(requestJson('/api/library/edits/batch', {
  method: 'POST',
  body: { action, ids: [id] },
  fallback: action === 'approve' ? 'לא הצלחנו לאשר את ההצעה.' : 'לא הצלחנו לדחות את ההצעה.',
  timeoutMs: 60000,
}))

/** "אשר את כל ההחלפות הזהות" */
export const approvePattern = (findReplace) => friendly(requestJson('/api/library/edits/batch', {
  method: 'POST',
  body: { action: 'approve', patternFilter: { find: findReplace.find, replace: findReplace.replace } },
  fallback: 'לא הצלחנו לאשר את ההחלפות.',
  timeoutMs: 300000,
}))

export const blockUser = (userId, { reason, rejectPending }) => requestJson(`/api/library/users/${userId}/block`, {
  method: 'POST',
  body: { blocked: true, reason, rejectPending },
  fallback: 'לא הצלחנו לחסום את המשתמש.',
})
