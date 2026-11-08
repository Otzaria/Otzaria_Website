// הבקשות של "משתמשים" ושל מגירת המשתמש — אותן נקודות קצה, אותן שיטות ואותם שדות כמו קודם (בלי שינוי
// בחוזה). העטיפה (adminRequest) מוסיפה: התחברות שפגה מזוהה, תקרת זמן, והודעת שגיאה בעברית.
// כל בקשה שמשנה משהו עוברת בתור אחד של המסך (useUserWrites), כך ששתי בקשות לא רצות במקביל.
//
//   רשימה          GET    /api/admin/users                          (כמו הרענון בטבלה הקודמת)
//   פרטים / תפקיד  PUT    /api/admin/users        { userId, name, email, role, points }
//   מפקח / חסימה    PUT    /api/admin/users        + isSupervisor / dictaEditBlocked (lib/adminUsersScreen/userTerms: flagBody)
//   מתנדב תיקונים  POST   /api/corrections/admin/volunteers { userId, isCorrectionsVolunteer } (כמו במסך דיווחי הטעויות)
//   מחיקה          DELETE /api/admin/users        { userId }
//   שלח הודעה      — admin/MessageUploaderDialog (POST /api/messages/send-admin, כמו במסך ההעלאות)
import { requestJson } from '@/components/admin/list/adminRequest'

export const USER_GONE_MESSAGE = 'המשתמש הזה כבר לא קיים. ייתכן שנמחק.'

/** משתמש שכבר לא קיים בשרת (PUT מחזיר 404 "User not found") */
export const isUserGone = (error) => error?.status === 404

/**
 * השגיאות של ה-PUT במילים פשוטות: 409 "Email already in use"; 400 — היחיד בשרת הוא "Invalid email address",
 * ולכן רק כשהבקשה שינתה את הדואר הוא מתורגם לשגיאת דואר (אחרת — ההודעה הכללית); 404 — המשתמש לא קיים.
 */
async function friendly(promise, { emailChanged = false } = {}) {
  try {
    return await promise
  } catch (error) {
    if (error?.status === 409 && emailChanged) error.message = 'כתובת הדואר הזו כבר שייכת למשתמש אחר.'
    if (error?.status === 400 && emailChanged) error.message = 'כתובת הדואר לא תקינה.'
    if (isUserGone(error)) error.message = USER_GONE_MESSAGE
    throw error
  }
}

export async function listUsers() {
  const data = await requestJson('/api/admin/users', { fallback: 'לא הצלחנו לטעון את רשימת המשתמשים.' })
  if (!Array.isArray(data?.users)) throw Object.assign(new Error('לא הצלחנו לטעון את רשימת המשתמשים.'), { status: 0 })
  return data.users
}

/**
 * @param {{ userId: string, name?: string, email?: string, role?: string, points?: number, isSupervisor?: boolean,
 *   dictaEditBlocked?: boolean }} body
 * @param {{ fallback?: string, emailChanged?: boolean, keepalive?: boolean }} [options] keepalive — בסגירת הדף (useDeferredActions)
 */
export const updateUser = (body, { fallback = 'לא הצלחנו לשמור את השינויים.', emailChanged = false, keepalive = false } = {}) => friendly(requestJson('/api/admin/users', {
  method: 'PUT',
  body,
  fallback,
  keepalive,
}), { emailChanged })

/** @param {string} userId @param {boolean} value @param {{ keepalive?: boolean }} [options] keepalive — בסגירת הדף */
export const setCorrectionsVolunteer = (userId, value, { keepalive = false } = {}) => requestJson('/api/corrections/admin/volunteers', {
  method: 'POST',
  body: { userId, isCorrectionsVolunteer: value },
  fallback: 'לא הצלחנו לעדכן את צוות התיקונים.',
  keepalive,
})

export const deleteUser = (userId) => requestJson('/api/admin/users', {
  method: 'DELETE',
  body: { userId },
  fallback: 'לא הצלחנו למחוק את המשתמש.',
})
