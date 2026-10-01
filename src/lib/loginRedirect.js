// לוגיקה טהורה של דף ההתחברות (/auth/login): יעד ההפניה אחרי התחברות והודעות
// השגיאה שמגיעות בפרמטר error של ה-URL. מופרדת מהרכיב כדי שרכיב השרת של הדף
// ורכיב הלקוח של הטופס ישתמשו באותם כללים, ושיהיה אפשר לבדוק אותם ישירות.

export const DEFAULT_LOGIN_REDIRECT = '/library/dashboard'

// מאשר רק יעד פנימי בטוח לפני ניווט מלא, ומונע שתי בעיות:
// 1. open-redirect — ?callbackUrl=https://evil.com או //evil.com (protocol-relative).
//    מקבלים אך ורק נתיב יחסי שמתחיל ב-"/" יחיד (לא "//" ולא "/\").
// 2. לופ רענון — ניתוב חזרה לדף ההתחברות עצמו. נופלים חזרה ליעד ברירת המחדל.
export function getSafeCallbackUrl(raw) {
  if (!raw || raw[0] !== '/') return DEFAULT_LOGIN_REDIRECT
  // "//" או "/\" מתפרשים בדפדפן כ-origin חיצוני
  if (raw[1] === '/' || raw[1] === '\\') return DEFAULT_LOGIN_REDIRECT
  const pathOnly = raw.split(/[?#]/)[0]
  if (pathOnly === '/auth/login' || pathOnly.startsWith('/auth/login/')) {
    return DEFAULT_LOGIN_REDIRECT
  }
  return raw
}

const URL_ERROR_MESSAGES = new Map([
  ['InvalidToken', 'קישור האימות אינו תקין או שכבר נעשה בו שימוש.'],
  ['TokenExpired', 'קישור האימות פג תוקף. אנא בקש קישור אימות חדש.'],
  ['ServerError', 'אירעה שגיאה בתקשורת מול השרת, אנא התחבר מחדש.'],
])

/** הודעת השגיאה לפרמטר error שב-URL, או מחרוזת ריקה כשאין הודעה מתאימה. */
export function loginErrorMessage(errorType) {
  return URL_ERROR_MESSAGES.get(errorType) ?? ''
}

/**
 * ערך יחיד מתוך searchParams של רכיב שרת (string | string[] | undefined) —
 * כמו URLSearchParams.get: הערך הראשון, או null כשאין.
 */
export function firstSearchParam(value) {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null
  return typeof value === 'string' ? value : null
}
