import crypto from 'crypto'

// מזהה דפדפן אנונימי להתקנות ישירות של תוספים — הבסיס ל"דירוג מאומת" גם למי
// שהתקין לפני שנרשם. העוגיה נקבעת/מתרעננת בכל יצירת טוקן התקנה, וההתקנות
// שנרשמו עליה נתבעות לחשבון בעת דירוג (claimAnonInstalls).
//
// זו עוגיה טכנית בלבד: ערך אקראי חסר משמעות, httpOnly, ואינה משמשת למעקב —
// רק לקישור התקנה→דירוג של אותו דפדפן עצמו.

export const INSTALL_ANON_COOKIE = 'otz_install_id'

// 400 יום — התקרה ש-Chrome אוכף על Max-Age ממילא
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

// אותו פורמט כמו טוקן ההתקנה — base64url באורך קבוע; כל דבר אחר נדחה
const ANON_ID_PATTERN = /^[A-Za-z0-9_-]{20,64}$/

// קריאת המזהה מהבקשה; ערך לא-תקין נחשב כאילו אין עוגיה
export function readInstallAnonId(request) {
  const value = request.cookies.get(INSTALL_ANON_COOKIE)?.value || ''
  return ANON_ID_PATTERN.test(value) ? value : null
}

export function generateInstallAnonId() {
  return crypto.randomBytes(24).toString('base64url')
}

// קביעה/רענון של העוגיה על התשובה (מאריך את חייה בכל התקנה)
export function setInstallAnonCookie(response, anonId) {
  response.cookies.set(INSTALL_ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS
  })
}
