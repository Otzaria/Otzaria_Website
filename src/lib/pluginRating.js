// דירוגי תוספים — כל החישובים הטהורים במקום אחד (בדיקות: pluginRating.test.mjs).
// הגישה ל-DB יושבת ב-src/lib/pluginRatingStore.js.
//
// למה לא ממוצע גולמי: ממוצע גולמי הופך תוסף עם דירוג בודד של 5 לראשון בחנות,
// לפני תוסף עם 100 דירוגים בממוצע 4.9. לכן הציון שלפיו ממיינים הוא ממוצע
// מוחלק (Bayesian shrinkage): לכל תוסף מתווספים RATING_SMOOTHING דירוגים
// וירטואליים בגובה הממוצע הגלובלי של החנות. תוסף עם מעט דירוגים "נגרר" אל
// הממוצע הזה, וככל שמצטברים דירוגים אמיתיים הציון מתנתק ממנו.
//
// חשוב: ratingAvg (מה שמוצג למשתמש) הוא הממוצע האמיתי. ratingScore הוא שדה
// פנימי למיון בלבד ואינו מוצג.

export const RATING_MIN = 1
export const RATING_MAX = 5

// מספר הדירוגים הווירטואליים. גדול יותר = שמרני יותר (נדרשים יותר דירוגים
// אמיתיים כדי לטפס). 8 מתאים לחנות שבה תוסף טיפוסי אוסף עשרות דירוגים.
export const RATING_SMOOTHING = 8

// עוגן ברירת המחדל, לפני שהצטברו בחנות מספיק דירוגים כדי לחשב ממוצע גלובלי
// אמיתי. גם ברירת המחדל של ratingScore בסכימה — כך תוסף ללא דירוגים יושב
// באמצע ולא בתחתית.
export const DEFAULT_PRIOR_AVG = 4

// מתחת לכמות הזאת ממוצע גלובלי הוא רעש — עדיף העוגן הקבוע
export const MIN_PRIOR_SAMPLE = 20

// משקל דירוג "מאומת" — משתמש שהתקנתו בפועל נרשמה (PluginInstall) — לעומת דירוג
// של משתמש מחובר שאין לו רישום התקנה. המשקל משפיע על הציון למיון בלבד;
// הממוצע המוצג מתייחס לכל הדירוגים באופן שווה.
export const VERIFIED_WEIGHT = 1.5
export const UNVERIFIED_WEIGHT = 1

export function isValidRatingValue(value) {
  return Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX
}

export function ratingWeight(verifiedInstall) {
  return verifiedInstall === true ? VERIFIED_WEIGHT : UNVERIFIED_WEIGHT
}

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

// הממוצע המוחלק. weight/weightedSum הם המשוקללים (מאומת שוקל יותר).
export function bayesianScore({
  weightedSum = 0,
  weight = 0,
  priorAvg = DEFAULT_PRIOR_AVG,
  smoothing = RATING_SMOOTHING
} = {}) {
  return (weightedSum + priorAvg * smoothing) / (weight + smoothing)
}

// הממוצע הגלובלי של החנות, מוגן מפני ערכים חריגים/חסרים
export function normalizePriorAvg(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PRIOR_AVG
  return Math.min(Math.max(value, RATING_MIN), RATING_MAX)
}

// חישוב מלא של האגרגט מתוך רשימת הדירוגים הגלויים של תוסף.
// מחזיר בדיוק את השדות שנשמרים על מסמך התוסף.
export function aggregateRatings(ratings, { priorAvg = DEFAULT_PRIOR_AVG, smoothing = RATING_SMOOTHING } = {}) {
  const breakdown = [0, 0, 0, 0, 0]
  let count = 0
  let sum = 0
  let verifiedCount = 0
  let weightedSum = 0
  let weight = 0

  for (const rating of ratings || []) {
    const value = Number(rating?.value)
    if (!isValidRatingValue(value)) continue
    const verified = rating.verifiedInstall === true

    count += 1
    sum += value
    breakdown[value - 1] += 1
    if (verified) verifiedCount += 1

    const currentWeight = ratingWeight(verified)
    weightedSum += currentWeight * value
    weight += currentWeight
  }

  const prior = normalizePriorAvg(priorAvg)
  return {
    ratingCount: count,
    ratingSum: sum,
    ratingVerifiedCount: verifiedCount,
    ratingBreakdown: breakdown,
    ratingWeightedSum: round(weightedSum, 3),
    ratingWeight: round(weight, 3),
    // הממוצע המוצג — האמיתי, ללא החלקה ובלי משקלי אימות
    ratingAvg: count > 0 ? round(sum / count, 2) : 0,
    ratingScore: round(bayesianScore({ weightedSum, weight, priorAvg: prior, smoothing }), 4)
  }
}

// הציון למיון, עם נפילה חיננית למסמכים ותיקים שטרם עברו חישוב
export function effectiveRatingScore(plugin) {
  const score = plugin?.ratingScore
  return typeof score === 'number' && Number.isFinite(score) ? score : DEFAULT_PRIOR_AVG
}

// סדר המיון בחנות: ציון מוחלק, ואז פופולריות ומספר המדרגים כשוברי שוויון.
//
// שני תוספים שאין להם דירוגים כלל נחשבים שווים לחלוטין (מחזיר 0), והמיון
// היציב של JS משמר ביניהם את הסדר הידני של המנהל. אחרת מעבר לסדר-לפי-דירוג
// היה מסדר מחדש קטגוריות שלמות לפי מספר ההורדות עוד לפני שהצטבר דירוג אחד.
export function compareByRating(a, b) {
  if (!(a?.ratingCount > 0) && !(b?.ratingCount > 0)) return 0

  const scoreDiff = effectiveRatingScore(b) - effectiveRatingScore(a)
  if (scoreDiff !== 0) return scoreDiff
  const downloadsDiff = (b.downloadCount || 0) - (a.downloadCount || 0)
  if (downloadsDiff !== 0) return downloadsDiff
  return (b.ratingCount || 0) - (a.ratingCount || 0)
}

// שדות הדירוג לתשובות ציבוריות. ratingScore אינו נחשף — הוא פנימי למיון.
export function ratingFieldsForPublic(plugin) {
  return {
    ratingAvg: plugin?.ratingCount > 0 ? plugin.ratingAvg || 0 : 0,
    ratingCount: plugin?.ratingCount || 0,
    ratingVerifiedCount: plugin?.ratingVerifiedCount || 0,
    // תמיד באורך 5 (1★..5★) גם למסמכים ותיקים
    ratingBreakdown: normalizeBreakdown(plugin?.ratingBreakdown)
  }
}

export function normalizeBreakdown(breakdown) {
  const result = [0, 0, 0, 0, 0]
  if (!Array.isArray(breakdown)) return result
  for (let i = 0; i < 5; i += 1) {
    const value = Number(breakdown[i])
    result[i] = Number.isFinite(value) && value > 0 ? Math.round(value) : 0
  }
  return result
}
