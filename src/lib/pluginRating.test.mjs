/**
 * בדיקות חישוב דירוגי התוספים. הרצה: npm test
 *
 * המקרה המרכזי: תוסף עם דירוג חיובי בודד לא יעקוף תוסף עם 100 דירוגים חיוביים
 * ואחד שלילי — למרות שהממוצע הגולמי שלו גבוה יותר.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateRatings,
  bayesianScore,
  compareByRating,
  effectiveRatingScore,
  isValidRatingValue,
  normalizeBreakdown,
  normalizePriorAvg,
  ratingFieldsForPublic,
  ratingWeight,
  DEFAULT_PRIOR_AVG,
  RATING_SMOOTHING,
  VERIFIED_WEIGHT
} from './pluginRating.js'

/** n דירוגים בערך value */
function ratings(value, n, { verified = false } = {}) {
  return Array.from({ length: n }, () => ({ value, verifiedInstall: verified }))
}

test('ולידציית ערך הדירוג — שלם 1..5 בלבד', () => {
  for (const value of [1, 2, 3, 4, 5]) assert.equal(isValidRatingValue(value), true)
  for (const value of [0, 6, -1, 4.5, NaN, '5', null, undefined]) {
    assert.equal(isValidRatingValue(value), false)
  }
})

test('הממוצע המוצג הוא הממוצע האמיתי, ללא החלקה', () => {
  const aggregate = aggregateRatings([{ value: 4 }, { value: 5 }])
  assert.equal(aggregate.ratingCount, 2)
  assert.equal(aggregate.ratingAvg, 4.5)
})

test('דירוג בודד של 5 אינו עוקף 100 חיוביים ואחד שלילי', () => {
  const single = aggregateRatings(ratings(5, 1))
  const many = aggregateRatings([...ratings(5, 100), { value: 1 }])

  // הממוצע הגולמי דווקא לטובת הבודד — וזו בדיוק הסיבה שלא ממיינים לפיו
  assert.ok(single.ratingAvg > many.ratingAvg)
  // הציון למיון הופך את היחס
  assert.ok(many.ratingScore > single.ratingScore, `${many.ratingScore} > ${single.ratingScore}`)
  // ובפער משמעותי, לא בשוליים
  assert.ok(many.ratingScore - single.ratingScore > 0.5)
})

test('דירוג בודד נגרר אל העוגן הגלובלי, בשני הכיוונים', () => {
  const high = aggregateRatings(ratings(5, 1))
  const low = aggregateRatings(ratings(1, 1))

  // 5 בודד: (5 + 4*8) / 9
  assert.equal(high.ratingScore, Math.round((37 / 9) * 10000) / 10000)
  // תוסף חדש עם דירוג שלילי אחד לא נקבר — הציון נשאר סביב 3.7 ולא 1
  assert.ok(low.ratingScore > 3.6 && low.ratingScore < 3.8)
})

test('ללא דירוגים — הציון הוא בדיוק העוגן, והממוצע 0', () => {
  const aggregate = aggregateRatings([])
  assert.equal(aggregate.ratingCount, 0)
  assert.equal(aggregate.ratingAvg, 0)
  assert.equal(aggregate.ratingScore, DEFAULT_PRIOR_AVG)
  assert.deepEqual(aggregate.ratingBreakdown, [0, 0, 0, 0, 0])
})

test('דירוגים לא תקינים מדולגים בשקט', () => {
  const aggregate = aggregateRatings([{ value: 5 }, { value: 9 }, { value: null }, { value: 3 }])
  assert.equal(aggregate.ratingCount, 2)
  assert.equal(aggregate.ratingSum, 8)
})

test('התפלגות הכוכבים נבנית לפי הערך', () => {
  const aggregate = aggregateRatings([...ratings(5, 3), ...ratings(3, 2), ...ratings(1, 1)])
  assert.deepEqual(aggregate.ratingBreakdown, [1, 0, 2, 0, 3])
  assert.equal(aggregate.ratingCount, 6)
})

test('דירוג מאומת שוקל יותר בציון אך לא בממוצע המוצג', () => {
  const plain = aggregateRatings(ratings(5, 4))
  const verified = aggregateRatings(ratings(5, 4, { verified: true }))

  // אותו ממוצע מוצג, אותו מספר מדרגים
  assert.equal(plain.ratingAvg, verified.ratingAvg)
  assert.equal(plain.ratingCount, verified.ratingCount)
  // אבל המשקל גבוה יותר, ולכן הציון מתקרב יותר לדירוג האמיתי
  assert.equal(verified.ratingWeight, 4 * VERIFIED_WEIGHT)
  assert.equal(verified.ratingVerifiedCount, 4)
  assert.ok(verified.ratingScore > plain.ratingScore)
})

test('דירוג מאומת שלילי מוריד יותר מדירוג רגיל שלילי', () => {
  const plain = aggregateRatings([...ratings(5, 10), { value: 1, verifiedInstall: false }])
  const verified = aggregateRatings([...ratings(5, 10), { value: 1, verifiedInstall: true }])
  assert.ok(verified.ratingScore < plain.ratingScore)
})

test('משקל הדירוג — מאומת מול רגיל', () => {
  assert.equal(ratingWeight(true), VERIFIED_WEIGHT)
  assert.equal(ratingWeight(false), 1)
  assert.equal(ratingWeight(undefined), 1)
})

test('עוגן חלופי מזיז את הציון', () => {
  const strict = aggregateRatings(ratings(5, 2), { priorAvg: 3 })
  const lenient = aggregateRatings(ratings(5, 2), { priorAvg: 4.5 })
  assert.ok(strict.ratingScore < lenient.ratingScore)
})

test('normalizePriorAvg מגן על ערכים חסרים וחריגים', () => {
  assert.equal(normalizePriorAvg(4.2), 4.2)
  assert.equal(normalizePriorAvg(undefined), DEFAULT_PRIOR_AVG)
  assert.equal(normalizePriorAvg(NaN), DEFAULT_PRIOR_AVG)
  assert.equal(normalizePriorAvg(99), 5)
  assert.equal(normalizePriorAvg(-3), 1)
})

test('bayesianScore — הנוסחה עצמה', () => {
  assert.equal(
    bayesianScore({ weightedSum: 10, weight: 2, priorAvg: 4, smoothing: RATING_SMOOTHING }),
    (10 + 32) / 10
  )
})

test('מסמך ותיק ללא ratingScore ממוין כאילו יש לו את העוגן', () => {
  assert.equal(effectiveRatingScore({}), DEFAULT_PRIOR_AVG)
  assert.equal(effectiveRatingScore(null), DEFAULT_PRIOR_AVG)
  assert.equal(effectiveRatingScore({ ratingScore: 4.6 }), 4.6)
})

test('סדר המיון: ציון, ואז הורדות, ואז מספר המדרגים', () => {
  const high = { ratingScore: 4.6, downloadCount: 10, ratingCount: 30 }
  const low = { ratingScore: 4.1, downloadCount: 9000, ratingCount: 300 }
  assert.deepEqual([low, high].sort(compareByRating), [high, low])

  // אותו ציון — הפופולריות שוברת שוויון
  const popular = { ratingScore: 4.3, downloadCount: 500, ratingCount: 2 }
  const quiet = { ratingScore: 4.3, downloadCount: 10, ratingCount: 90 }
  assert.deepEqual([quiet, popular].sort(compareByRating), [popular, quiet])
})

test('תוספים ללא דירוגים שומרים על הסדר הידני ולא מסתדרים לפי הורדות', () => {
  const first = { name: 'ידני-ראשון', ratingCount: 0, downloadCount: 5 }
  const second = { name: 'ידני-שני', ratingCount: 0, downloadCount: 9000 }
  assert.equal(compareByRating(first, second), 0)
  // מיון יציב — הסדר המקורי נשמר
  assert.deepEqual([first, second].sort(compareByRating).map((p) => p.name), ['ידני-ראשון', 'ידני-שני'])
})

test('תוסף מדורג היטב עולה מעל לא-מדורגים, ומדורג גרוע צולל מתחתיהם', () => {
  const unrated = { name: 'ללא', ratingCount: 0, downloadCount: 100 }
  const great = { name: 'מעולה', ratingCount: 40, ratingScore: 4.8, downloadCount: 1 }
  const poor = { name: 'גרוע', ratingCount: 40, ratingScore: 2.2, downloadCount: 1 }
  assert.deepEqual(
    [unrated, poor, great].sort(compareByRating).map((p) => p.name),
    ['מעולה', 'ללא', 'גרוע']
  )
})

test('שדות ציבוריים — ללא ratingScore, ועם התפלגות באורך 5', () => {
  const fields = ratingFieldsForPublic({
    ratingCount: 3,
    ratingAvg: 4.33,
    ratingVerifiedCount: 1,
    ratingBreakdown: [0, 0, 1],
    ratingScore: 4.12
  })
  assert.equal(fields.ratingScore, undefined)
  assert.equal(fields.ratingAvg, 4.33)
  assert.deepEqual(fields.ratingBreakdown, [0, 0, 1, 0, 0])

  // תוסף ללא דירוגים — 0 ולא ממוצע שנשאר מחישוב קודם
  assert.equal(ratingFieldsForPublic({ ratingCount: 0, ratingAvg: 4.5 }).ratingAvg, 0)
  assert.deepEqual(ratingFieldsForPublic({}).ratingBreakdown, [0, 0, 0, 0, 0])
})

test('normalizeBreakdown מנקה קלט פגום', () => {
  assert.deepEqual(normalizeBreakdown(null), [0, 0, 0, 0, 0])
  assert.deepEqual(normalizeBreakdown([1, 'x', -4, 2.6, 3, 9]), [1, 0, 0, 3, 3])
})
