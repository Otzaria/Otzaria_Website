/**
 * הצורה שבה כינוי נשמר בפורק, והמפתח שלפיו אוצריא רואה שני כינויים כזהים.
 *
 * SeforimLibrary (Generator.sanitizeAcronymTerm) מסיר ניקוד וטעמים, מחליף מקף עברי ברווח ומוחק
 * ׳ ו-״, ואילו האפליקציה (normalizeForFindRefMatch) מתעלמת מכל גרשיים ומכל פיסוק. לכן נשמר כינוי
 * נקי, עם גרשיים ASCII אחידים, וכינוי שנבדל מאחר רק בגרשיים או בפיסוק נחשב כפילות.
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

/** המפתח שלפיו אוצריא מתאימה כינוי: גרשיים נמחקים, וכל תו שאינו אות או ספרה הוא רווח. */
export function aliasKey(value) {
  return normalizeAlias(value).replace(/["']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase()
}

/** כינוי קיים שאוצריא אינה מבדילה בינו לבין [alias], או null. */
export function duplicateAlias(alias, aliases) {
  const key = aliasKey(alias)
  return aliases.find((a) => aliasKey(a) === key) ?? null
}

/** צורה עם גרשיים (רמב"ם) עדיפה לשמירה על צורה בלעדיהם (רמבם). */
export const hasQuotes = (alias) => /["']/.test(normalizeAlias(alias))

/**
 * @returns {string|null} הודעת שגיאה בעברית, או null כשהכינוי תקין
 */
export function aliasProblem(alias, bookTitle) {
  const clean = normalizeAlias(alias)
  if (!clean) return 'יש להזין כינוי'
  if (clean.length > MAX_ALIAS_LENGTH) return `כינוי ארוך מ-${MAX_ALIAS_LENGTH} תווים`
  if (!/[\p{L}\p{N}]/u.test(clean)) return 'כינוי חייב לכלול אות או ספרה'
  if (bookTitle !== undefined && aliasKey(clean) === aliasKey(bookTitle)) {
    return 'הכינוי זהה לשם הספר (או שונה ממנו רק בגרשיים או בפיסוק), ואוצריא כבר מוצאת אותו לפי השם'
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

/**
 * הצורות של שם ספר בספרייה שלפיהן SeforimLibrary מחפש אותו בפורק (Generator.fetchAcronymsForTitle).
 * לשם בפורק שאינו אחת מהן, הכינויים אינם מגיעים לתוכנה.
 */
export function libraryTitleLookups(title) {
  const t = String(title ?? '')
  const squash = (s) => s.replace(/\s+/g, ' ').trim()
  return new Set([
    t,
    t.replace(/[״"׳']/g, '').trim(),
    t.replace(/,/g, ' ').trim(),
    squash(t.replace(/[!-/:-@[-`{-~]/g, ' ')),
    squash(t.replace(DIACRITICS, '').replace(/־/g, ' ').replace(/[״׳]/g, '')),
  ].filter(Boolean))
}

/** האם השם שהוזן יתאים לאחד מספרי הספרייה, כפי ש-SeforimLibrary מחפש. */
export function matchesLibraryTitle(title, libraryTitles) {
  const clean = normalizeBookTitle(title)
  return libraryTitles.some((t) => libraryTitleLookups(t).has(clean))
}

/** ספרי הספרייה הקרובים ביותר לשם שהוזן, לפי מילים משותפות. */
export function suggestLibraryTitles(title, libraryTitles, limit = 5) {
  const words = new Set(aliasKey(title).split(' ').filter((w) => w.length > 1))
  if (words.size === 0) return []
  return libraryTitles
    .map((t) => {
      const other = aliasKey(t).split(' ')
      const shared = other.filter((w) => words.has(w)).length
      return { t, score: shared / Math.max(words.size, other.length) }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.t.length - b.t.length)
    .slice(0, limit)
    .map((s) => s.t)
}
