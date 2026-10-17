import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isPositiveInteger,
  pickLibraryStatsAssetUrl,
  parseLibraryStats,
  extractAppDownloads,
  formatExactNumber,
  buildStatItems,
  formatStatParts,
  withTimeout
} from './homeStats.js'

// עוזר: release בצורת תשובת ה-API של GitHub
function release(tag, { draft = false, prerelease = false, published = '2026-09-01T00:00:00Z', stats = true } = {}) {
  const assets = [{ name: 'seforim.db.zst', browser_download_url: `https://example.test/${tag}/seforim.db.zst` }]
  if (stats) assets.push({ name: 'library_stats.json', browser_download_url: `https://example.test/${tag}/library_stats.json` })
  return { tag_name: tag, draft, prerelease, published_at: published, assets }
}

test('isPositiveInteger: רק שלם חיובי ממש', () => {
  assert.equal(isPositiveInteger(1), true)
  assert.equal(isPositiveInteger(5812829), true)
  assert.equal(isPositiveInteger(0), false)
  assert.equal(isPositiveInteger(-3), false)
  assert.equal(isPositiveInteger(1.5), false)
  assert.equal(isPositiveInteger('7367'), false)
  assert.equal(isPositiveInteger(null), false)
  assert.equal(isPositiveInteger(NaN), false)
  assert.equal(isPositiveInteger(Infinity), false)
})

test('pickLibraryStatsAssetUrl: מדלג על prerelease/טיוטה/תגיות שאינן DB', () => {
  const releases = [
    release('lines-snapshot-sha256-abc', { prerelease: true, published: '2026-09-17T00:00:00Z' }),
    release('pipeline-result-run-1-1', { published: '2026-09-12T00:00:00Z' }),
    release('v28-20260910220310', { published: '2026-09-11T00:00:00Z' }),
    release('v29-20260920000000', { draft: true, published: '2026-09-20T00:00:00Z' }),
    release('v26-20260904110044', { prerelease: true, published: '2026-09-04T00:00:00Z' }),
    release('v27-20260906092829', { published: '2026-09-06T00:00:00Z', stats: false })
  ]
  assert.equal(pickLibraryStatsAssetUrl(releases), 'https://example.test/v28-20260910220310/library_stats.json')
})

test('pickLibraryStatsAssetUrl: בוחר לפי תאריך פרסום ולא לפי סדר הרשימה', () => {
  const releases = [
    release('v27-x', { published: '2026-09-06T00:00:00Z' }),
    release('v28-x', { published: '2026-09-11T00:00:00Z' })
  ]
  assert.equal(pickLibraryStatsAssetUrl(releases), 'https://example.test/v28-x/library_stats.json')
})

test('pickLibraryStatsAssetUrl: נסיגה ל-release קודם כשבחדש אין קובץ סטטיסטיקה', () => {
  const releases = [
    release('v29-x', { published: '2026-09-20T00:00:00Z', stats: false }),
    release('v28-x', { published: '2026-09-11T00:00:00Z' })
  ]
  assert.equal(pickLibraryStatsAssetUrl(releases), 'https://example.test/v28-x/library_stats.json')
})

test('pickLibraryStatsAssetUrl: קלט לא תקין/ריק → null', () => {
  assert.equal(pickLibraryStatsAssetUrl(null), null)
  assert.equal(pickLibraryStatsAssetUrl({ message: 'API rate limit exceeded' }), null)
  assert.equal(pickLibraryStatsAssetUrl([]), null)
  assert.equal(pickLibraryStatsAssetUrl([release('v1-x', { stats: false })]), null)
  assert.equal(pickLibraryStatsAssetUrl([null, { tag_name: 'v2-x' }]), null)
})

test('parseLibraryStats: קובץ תקין', () => {
  const json = { schema_version: 1, db_version: 28, books: 7367, links: 5812829, lines: 6031484 }
  // lines (פסקאות) כבר אינו מוצג ואינו נקרא
  assert.deepEqual(parseLibraryStats(json), { books: 7367, links: 5812829 })
})

test('parseLibraryStats: שדה לא תקין נפסל לבד', () => {
  const json = { schema_version: 1, books: 7367, links: '5812829' }
  assert.deepEqual(parseLibraryStats(json), { books: 7367, links: null })
})

test('parseLibraryStats: גרסת סכמה לא מוכרת / קלט ריק → הכל null', () => {
  const empty = { books: null, links: null }
  assert.deepEqual(parseLibraryStats({ schema_version: 2, books: 1, links: 1 }), empty)
  assert.deepEqual(parseLibraryStats(null), empty)
  assert.deepEqual(parseLibraryStats('oops'), empty)
})

test('extractAppDownloads', () => {
  // רק המאגר הנוכחי — לא סכום הקטגוריה app שכולל גם את Sivan22
  assert.equal(extractAppDownloads({ summary: { by_source: { otzaria: 73152, sivan22: 49684 }, by_category: { app: 122836 } } }), 73152)
  assert.equal(extractAppDownloads({ summary: { by_source: { otzaria: 0 } } }), null)
  assert.equal(extractAppDownloads({ summary: {} }), null)
  assert.equal(extractAppDownloads(null), null)
})

test('formatExactNumber: מספר מדויק עם מפריד אלפים, בלי עיגול', () => {
  assert.equal(formatExactNumber(0), '0')
  assert.equal(formatExactNumber(7), '7')
  assert.equal(formatExactNumber(999), '999')
  assert.equal(formatExactNumber(1000), '1,000')
  assert.equal(formatExactNumber(7367), '7,367')
  assert.equal(formatExactNumber(122836), '122,836')
  assert.equal(formatExactNumber(5812829), '5,812,829')
  assert.equal(formatExactNumber(1234567890), '1,234,567,890')
  assert.equal(formatExactNumber(-1234), '-1,234')
  assert.equal(formatExactNumber(NaN), '')
})

test('buildStatItems: סדר קבוע והשמטת ערכים חסרים', () => {
  const items = buildStatItems({ plugins: 42, books: 7367, links: null, downloads: 0 })
  assert.deepEqual(items.map((item) => item.key), ['books', 'plugins'])
  assert.equal(items[0].value, 7367)
  assert.equal(items[0].label, 'ספרים')
})

test('buildStatItems: פסקאות (lines) אינן מוצגות עוד, גם כשהערך קיים', () => {
  const items = buildStatItems({ books: 7367, lines: 6031484 })
  assert.deepEqual(items.map((item) => item.key), ['books'])
})

test('formatStatParts: מדויק עד 100,000, ומעליו קיצור עברי מעוגל כלפי מטה', () => {
  assert.deepEqual(formatStatParts(42), { number: '42', unit: null })
  assert.deepEqual(formatStatParts(7367), { number: '7,367', unit: null })
  assert.deepEqual(formatStatParts(99999), { number: '99,999', unit: null })
  assert.deepEqual(formatStatParts(122836), { number: '122', unit: 'אלף' })
  assert.deepEqual(formatStatParts(999999), { number: '999', unit: 'אלף' })
  assert.deepEqual(formatStatParts(1000000), { number: '1', unit: 'מיליון' })
  assert.deepEqual(formatStatParts(5812829), { number: '5.8', unit: 'מיליון' })
  assert.deepEqual(formatStatParts(5899999), { number: '5.8', unit: 'מיליון' })
  assert.deepEqual(formatStatParts(100000), { number: '100', unit: 'אלף' })
  assert.deepEqual(formatStatParts(12345678), { number: '12.3', unit: 'מיליון' })
  assert.deepEqual(formatStatParts(999999999), { number: '999.9', unit: 'מיליון' })
  assert.deepEqual(formatStatParts(1000000000), { number: '1', unit: 'מיליארד' })
  assert.deepEqual(formatStatParts(2750000000), { number: '2.7', unit: 'מיליארד' })
  assert.deepEqual(formatStatParts(0), { number: '0', unit: null })
  assert.deepEqual(formatStatParts(NaN), { number: '', unit: null })
  assert.deepEqual(formatStatParts(Infinity), { number: '', unit: null })
})

test('buildStatItems: הכל חסר → רשימה ריקה', () => {
  assert.deepEqual(buildStatItems({}), [])
  assert.deepEqual(buildStatItems(null), [])
})

const delay = (ms, value, reject = false) =>
  new Promise((resolve, rejectFn) => setTimeout(() => (reject ? rejectFn(value) : resolve(value)), ms))

test('withTimeout: הבטחה מהירה — הערך שלה', async () => {
  assert.equal(await withTimeout(delay(5, 42), 200, null), 42)
})

test('withTimeout: הבטחה איטית — fallback אחרי הזמן, ו-onTimeout פעם אחת', async () => {
  let calls = 0
  const started = Date.now()
  assert.equal(await withTimeout(delay(500, 42), 30, null, () => { calls++ }), null)
  assert.ok(Date.now() - started < 300)
  assert.equal(calls, 1)
})

test('withTimeout: דחייה לפני הזמן עוברת הלאה', async () => {
  await assert.rejects(withTimeout(delay(5, new Error('boom'), true), 200, null), /boom/)
})

test('withTimeout: דחייה אחרי הזמן — בלי unhandled rejection', async () => {
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    assert.equal(await withTimeout(delay(40, new Error('late'), true), 10, 'fallback'), 'fallback')
    await delay(80)
    assert.deepEqual(unhandled, [])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})
