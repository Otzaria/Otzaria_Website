/**
 * בדיקות קיבוץ הספרים הפרטיים לסטים. הרצה: npm test
 *
 * המקרים המרכזיים: סט אוטומטי נוצר רק משני ספרים ומעלה בתבנית "<שם> על <נושא>",
 * ושיוך ידני גובר על הקיבוץ האוטומטי (גם כשהוא מפרק סט אוטומטי קיים).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSourceEntries,
  deriveAutoSetName,
  isSetPath,
  manualSetKeyFromLabel,
  normalizeManualSets,
  toAutoSetPath,
  toManualSetPath,
  toSetPath,
  validateManualSets,
  MANUAL_SET_LIMITS,
  SET_PATH_PREFIX,
} from './private-sources-sets.js'

const book = (title, category = 'הלכה') => ({
  bookPath: `ספרים/אוצריא/${category}/${title}.txt`,
  bookTitle: title,
  category,
  fileType: 'txt',
  size: 1,
})

// ===== גזירת שם הסט =====

test('deriveAutoSetName — החלק שלפני " על " הראשון', () => {
  assert.equal(deriveAutoSetName('עולת שלמה על זבחים'), 'עולת שלמה')
  assert.equal(deriveAutoSetName('  עולת שלמה   על זבחים'), 'עולת שלמה')
  assert.equal(deriveAutoSetName('ביאור על התורה על דרך הפשט'), 'ביאור')
})

test('deriveAutoSetName — ללא תבנית מחזיר ריק', () => {
  assert.equal(deriveAutoSetName('כתר ראש'), '')
  assert.equal(deriveAutoSetName('על התורה'), '')
  assert.equal(deriveAutoSetName(undefined), '')
})

test('isSetPath / toSetPath — מרחבי שמות נפרדים לידני ולאוטומטי', () => {
  assert.equal(toManualSetPath('עולת שלמה'), 'set:m:עולת שלמה')
  assert.equal(toAutoSetPath('עולת שלמה'), 'set:a:עולת שלמה')
  assert.equal(toSetPath('עולת שלמה', { isManual: true }), 'set:m:עולת שלמה')
  assert.equal(toSetPath('עולת שלמה'), 'set:a:עולת שלמה')
  // סט ידני וסט אוטומטי באותו שם אינם חולקים רשומה
  assert.notEqual(toManualSetPath('x'), toAutoSetPath('x'))

  assert.ok(toManualSetPath('x').startsWith(SET_PATH_PREFIX))
  assert.ok(isSetPath('set:m:עולת שלמה'))
  assert.ok(isSetPath('set:a:עולת שלמה'))
  assert.ok(!isSetPath('ספרים/אוצריא/הלכה/כתר ראש.txt'))
})

test('manualSetKeyFromLabel — רווחים לקווים תחתונים', () => {
  assert.equal(manualSetKeyFromLabel('  שולחן  ערוך '), 'שולחן_ערוך')
})

// ===== קיבוץ אוטומטי =====

test('שני ספרים באותה תבנית מתקבצים לסט אוטומטי', () => {
  const books = [book('עולת שלמה על זבחים'), book('עולת שלמה על מנחות'), book('כתר ראש')]
  const { entries, setPaths } = buildSourceEntries({ books })

  const sets = entries.filter((e) => e.kind === 'set')
  assert.equal(sets.length, 1)
  assert.equal(sets[0].setName, 'עולת שלמה')
  assert.equal(sets[0].isManual, false)
  assert.equal(sets[0].bookPath, 'set:a:עולת שלמה')
  assert.deepEqual(
    sets[0].books.map((b) => b.bookTitle),
    ['עולת שלמה על זבחים', 'עולת שלמה על מנחות']
  )
  assert.deepEqual(setPaths, ['set:a:עולת שלמה'])

  const standalone = entries.filter((e) => e.kind === 'book')
  assert.deepEqual(
    standalone.map((b) => b.bookTitle),
    ['כתר ראש']
  )
})

test('תבנית ייחודית נשארת ספר עומד בפני עצמו', () => {
  const books = [book('עולת שלמה על זבחים'), book('כתר ראש')]
  const { entries } = buildSourceEntries({ books })
  assert.equal(entries.filter((e) => e.kind === 'set').length, 0)
  assert.equal(entries.length, 2)
})

test('קטגוריית הסט היא הנפוצה בין חבריו; בשוויון — הראשונה אלפביתית', () => {
  const common = buildSourceEntries({
    books: [
      book('עולת שלמה על זבחים', 'קודשים'),
      book('עולת שלמה על מנחות', 'קודשים'),
      book('עולת שלמה על חולין', 'הלכה'),
    ],
  }).entries.find((e) => e.kind === 'set')
  assert.equal(common.category, 'קודשים')

  const tie = buildSourceEntries({
    books: [book('עולת שלמה על זבחים', 'קודשים'), book('עולת שלמה על מנחות', 'הלכה')],
  }).entries.find((e) => e.kind === 'set')
  assert.equal(tie.category, 'הלכה')
})

// ===== קיבוץ ידני =====

test('סט ידני גובר על הקיבוץ האוטומטי, והשארית מתפרקת כשנשאר חבר אחד', () => {
  const books = [book('עולת שלמה על זבחים'), book('עולת שלמה על מנחות'), book('כתר ראש')]
  const manualSets = {
    ידני: { label: 'סט ידני', bookPaths: [books[0].bookPath, books[2].bookPath] },
  }

  const { entries, setPaths } = buildSourceEntries({ books, manualSets })
  const sets = entries.filter((e) => e.kind === 'set')

  assert.equal(sets.length, 1)
  assert.equal(sets[0].isManual, true)
  assert.equal(sets[0].bookPath, 'set:m:ידני')
  assert.equal(sets[0].books.length, 2)
  assert.deepEqual(setPaths, ['set:m:ידני'])

  // "עולת שלמה על מנחות" נשאר יחיד ולכן אינו סט
  assert.deepEqual(
    entries.filter((e) => e.kind === 'book').map((b) => b.bookTitle),
    ['עולת שלמה על מנחות']
  )
})

test('סט ידני שנשאר עם חבר אחד מהקיבוץ האוטומטי — השארית עומדת בפני עצמה', () => {
  const books = [
    book('עולת שלמה על זבחים'),
    book('עולת שלמה על מנחות'),
    book('עולת שלמה על חולין'),
  ]
  const manualSets = { א: { label: 'א', bookPaths: [books[0].bookPath, books[1].bookPath] } }
  const { entries } = buildSourceEntries({ books, manualSets })

  assert.equal(entries.filter((e) => e.kind === 'set').length, 1)
  assert.deepEqual(
    entries.filter((e) => e.kind === 'book').map((b) => b.bookTitle),
    ['עולת שלמה על חולין']
  )
})

test('סט ידני בשם זהה לסט אוטומטי מקבל מזהה נפרד (ללא התנגשות)', () => {
  const books = [
    book('עולת שלמה על זבחים'),
    book('עולת שלמה על מנחות'),
    book('כתר ראש'),
  ]
  const manualSets = {
    'עולת שלמה': { label: 'עולת שלמה', bookPaths: [books[2].bookPath] },
  }

  const { entries, setPaths } = buildSourceEntries({ books, manualSets })
  const sets = entries.filter((e) => e.kind === 'set')

  assert.equal(sets.length, 2)
  assert.deepEqual([...setPaths].sort(), ['set:a:עולת שלמה', 'set:m:עולת שלמה'])
  // אין שני פריטים עם אותו bookPath (מפתחות React / רשומה משותפת בטעות)
  assert.equal(new Set(entries.map((e) => e.bookPath)).size, entries.length)
})

test('נתיב שאינו קיים בגיטהאב אינו נספר כחבר, והסט נשמר עם קטגוריית ברירת מחדל', () => {
  const { entries } = buildSourceEntries({
    books: [book('כתר ראש')],
    manualSets: { ריק: { label: 'ריק', bookPaths: ['ספרים/אוצריא/הלכה/לא קיים.txt'] } },
  })
  const set = entries.find((e) => e.kind === 'set')
  assert.equal(set.books.length, 0)
  assert.equal(set.category, 'אחר')
})

// ===== נרמול וולידציה =====

test('normalizeManualSets — מדלג על ערכים לא תקינים ומסיר כפילויות', () => {
  const result = normalizeManualSets({
    a: { label: 'א', bookPaths: ['x', 'x', 'y'] },
    b: { label: 'ב', bookPaths: ['y', 'z'] },
    '': { label: 'ריק' },
    c: 'לא אובייקט',
  })

  assert.deepEqual(result.a.bookPaths, ['x', 'y'])
  // 'y' נלקח על ידי הסט הראשון
  assert.deepEqual(result.b.bookPaths, ['z'])
  assert.equal(result.c.label, 'c')
  assert.ok(!('' in result))
})

test('normalizeManualSets — ערך לא אובייקט מחזיר ריק', () => {
  assert.deepEqual(normalizeManualSets(null), {})
  assert.deepEqual(normalizeManualSets([1, 2]), {})
})

test('validateManualSets — תקין', () => {
  const { value, error } = validateManualSets({
    a: { label: '  א  ', bookPaths: [' x ', 'x', 'y'] },
  })
  assert.equal(error, undefined)
  assert.deepEqual(value, { a: { label: 'א', bookPaths: ['x', 'y'] } })
})

test('validateManualSets — ספר בשני סטים נדחה, והשגיאה מציגה את שמות הסטים', () => {
  const { error } = validateManualSets({
    a: { label: 'סט ראשון', bookPaths: ['x'] },
    b: { label: 'סט שני', bookPaths: ['x'] },
  })
  assert.ok(error)
  assert.ok(error.includes('סט ראשון'), error)
  assert.ok(error.includes('סט שני'), error)
  // המפתח הגולמי אינו מוצג
  assert.ok(!error.includes('"a"'), error)
})

test('validateManualSets — תקרה מצטברת לכל הסטים יחד', () => {
  const total = MANUAL_SET_LIMITS.totalPathsMax
  const perSet = MANUAL_SET_LIMITS.pathsMax
  const sets = {}
  let created = 0
  for (let i = 0; created <= total; i += 1) {
    const paths = Array.from({ length: perSet }, (_, j) => `p${i}-${j}`)
    sets[`s${i}`] = { label: `סט ${i}`, bookPaths: paths }
    created += perSet
  }

  const { error, value } = validateManualSets(sets)
  assert.equal(value, undefined)
  assert.ok(error.includes(String(total)), error)
})

test('validateManualSets — שם חסר או ערך לא תקין נדחים', () => {
  assert.ok(validateManualSets({ a: { label: '  ', bookPaths: [] } }).error)
  assert.ok(validateManualSets({ a: { label: 'א', bookPaths: 'x' } }).error)
  assert.ok(validateManualSets(null).error)
  // אובייקט ריק תקין — אין סטים כלל
  assert.deepEqual(validateManualSets({}).value, {})
})
