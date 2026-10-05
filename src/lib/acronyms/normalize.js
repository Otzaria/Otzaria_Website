/**
 * הצורה שבה כינוי נשמר בפורק, והמפתח שלפיו אוצריא רואה שני כינויים כזהים.
 *
 * SeforimLibrary (Generator.sanitizeAcronymTerm) מסיר ניקוד וטעמים, מחליף מקף עברי ברווח ומוחק
 * ׳ ו-״, ואילו האפליקציה (normalizeForFindRefMatch) מתעלמת גם מגרשיים ASCII. לכן נשמר כינוי
 * נקי, עם גרשיים ASCII אחידים, וכינוי שנבדל מאחר רק בגרשיים נחשב כפילות.
 */

const DIACRITICS = /[֑-ֽֿׁ-ׂׄ-ׇ]/g
const WORD_BREAKS = /[־׀|]/g // מקף עברי ופסק — רווח, כמו במחולל ובאפליקציה
const SOF_PASUQ = /׃/g
const INVISIBLE = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g
const DOUBLE_QUOTES = /[״“”„‟″]/g
const SINGLE_QUOTES = /[׳‘’‚‛′`]/g

export const MAX_ALIAS_LENGTH = 120

/** הצורה שנשמרת בפורק. */
export function normalizeAlias(value) {
  return String(value ?? '')
    .replace(INVISIBLE, ' ')
    .replace(DIACRITICS, '')
    .replace(SOF_PASUQ, '')
    .replace(WORD_BREAKS, ' ')
    .replace(DOUBLE_QUOTES, '"')
    .replace(SINGLE_QUOTES, "'")
    .replace(/''/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** המפתח שלפיו אוצריא מתאימה כינוי — בלי גרשיים ובלי הבדלי רווחים. */
export function aliasKey(value) {
  return normalizeAlias(value).replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * @returns {string|null} הודעת שגיאה בעברית, או null כשהכינוי תקין
 */
export function aliasProblem(alias, bookTitle) {
  const clean = normalizeAlias(alias)
  if (!clean) return 'יש להזין כינוי'
  if (clean.length > MAX_ALIAS_LENGTH) return `כינוי ארוך מ-${MAX_ALIAS_LENGTH} תווים`
  if (!/[\p{L}\p{N}]/u.test(clean)) return 'כינוי חייב לכלול אות או ספרה'
  if (bookTitle !== undefined && aliasKey(clean) === aliasKey(bookTitle)) {
    return 'הכינוי זהה לשם הספר (או שונה ממנו רק בגרשיים), ואוצריא כבר מוצאת אותו לפי השם'
  }
  return null
}

/**
 * שם ספר אחר שהכינוי זהה לו (בלי הבדלי גרשיים), או null. כינוי כזה עלול להוביל את מי שמחפש את
 * הספר האחר בתוכנה לספר הזה, אבל לפעמים הוא מכוון (מהדורה אחרת של אותו חיבור), ולכן רק מזהירים.
 * @param {Map<string,string>} titlesByKey aliasKey של שם ספר ← שם הספר
 */
export function conflictingTitle(alias, ownTitle, titlesByKey) {
  const other = titlesByKey.get(aliasKey(alias))
  return other && aliasKey(other) !== aliasKey(ownTitle) ? other : null
}

/** שם ספר חדש: אותו ניקוי, בלי המרת גרשיים — השם חייב להיות זהה לשם בספריית אוצריא. */
export function normalizeBookTitle(value) {
  return String(value ?? '').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim()
}
