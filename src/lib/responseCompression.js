/**
 * responseCompression.js — מאפשר ל-next start לדחוס (gzip) את תשובות ה-API.
 *
 * הבעיה: Next דוחס תשובות דרך ספריית compression, שמחליטה לפי
 * `res.getHeader('Content-Type')` ודורשת *מחרוזת*. אבל תשובה של route handler
 * עוברת דרך NodeNextResponse.appendHeader, שכותב כל כותרת כמערך
 * (`['application/json']`). המערך נכשל בבדיקת "compressible", ולכן כל JSON של
 * `src/app/api/**` יוצא לא דחוס — גם בפרודקשן (nginx שלפני האתר אינו דוחס
 * application/json). דפי HTML אינם נפגעים כי Next כותב להם את הכותרת כמחרוזת.
 *
 * התיקון: ל-Content-Type אין משמעות לערכים מרובים, ולכן מערך בן איבר אחד
 * שקול לגמרי למחרוזת. נרמול בנקודת הכתיבה (setHeader) מחזיר לספריית
 * compression את הערך שהיא מצפה לו. שום כותרת אחרת אינה משתנה.
 *
 * ההתקנה נעשית פעם אחת בעליית השרת, ב-src/instrumentation.js.
 */

const INSTALLED = Symbol.for('otzaria.contentTypeNormalizer')

/**
 * מחזיר את הערך שייכתב לכותרת: מערך בן איבר אחד של Content-Type הופך
 * למחרוזת; כל ערך אחר (וכל כותרת אחרת) מוחזר כמות שהוא.
 */
export function normalizeHeaderValue(name, value) {
  if (
    Array.isArray(value) &&
    value.length === 1 &&
    typeof name === 'string' &&
    name.toLowerCase() === 'content-type'
  ) {
    return String(value[0])
  }
  return value
}

/**
 * עוטף את setHeader של prototype (בפועל http.ServerResponse.prototype) כך
 * שיעבור דרך normalizeHeaderValue. אידמפוטנטי — קריאה חוזרת אינה עוטפת שוב.
 */
export function installContentTypeNormalizer(proto) {
  if (!proto || typeof proto.setHeader !== 'function' || proto[INSTALLED]) return false
  const originalSetHeader = proto.setHeader
  proto.setHeader = function setHeader(name, value) {
    return originalSetHeader.call(this, name, normalizeHeaderValue(name, value))
  }
  Object.defineProperty(proto, INSTALLED, { value: true })
  return true
}
