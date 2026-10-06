/**
 * בדיקות הליבה הטהורה של עדכון הכינויים בפורק. הרצה: npm test
 * בדיקת ההלוך-חזור מול הקובץ האמיתי רצה רק כש-ACRONYMIZER_SQL מצביע עליו.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { parseDump, exportDump, listBooks } from './dump.js'
import { aliasKey, aliasProblem, conflictingTitle, duplicateAlias, hasQuotes, matchesLibraryTitle, normalizeAlias, suggestLibraryTitles } from './normalize.js'
import { applyChangeSet, planAddAliases, summarizeChangeSet, validateChangeSet } from './changes.js'

const HEADER = 'PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\nCREATE TABLE IF NOT EXISTS Books (id INTEGER);\n'
const dump = (books, acronyms, links) =>
  HEADER +
  books.map(([id, t]) => `INSERT INTO Books(id,title) VALUES(${id},'${t.replace(/'/g, "''")}');\n`).join('') +
  acronyms.map(([id, t]) => `INSERT INTO Acronyms(id,acronym) VALUES(${id},'${t.replace(/'/g, "''")}');\n`).join('') +
  links.map(([id, b, a]) => `INSERT INTO BookAcronyms(id,book_id,acronym_id) VALUES(${id},${b},${a});\n`).join('') +
  'COMMIT;\n'

const FIXTURE = dump(
  [[1, 'בראשית'], [2, "ספר קנאת ה' צבאות"], [3, 'תוספות רבי עקיבא איגר על משנה שבת']],
  [[1, "בר'"], [2, 'ספר בראשית'], [3, 'קנאת ה צבאות'], [5, 'תוס רעק"א שבת'], [6, 'תוס רבי עיקבא איגר שבת']],
  [[1, 1, 1], [2, 1, 2], [3, 2, 3], [4, 3, 5], [7, 3, 6]],
)

test('parse + export is byte-identical, including quote escaping and id gaps', () => {
  assert.equal(exportDump(parseDump(FIXTURE)), FIXTURE)
})

test('parse rejects CRLF, a missing COMMIT and non-canonical lines', () => {
  assert.throws(() => parseDump(FIXTURE.replace(/\n/g, '\r\n')), /LF/)
  assert.throws(() => parseDump(FIXTURE.replace('COMMIT;\n', '')), /COMMIT/)
  assert.throws(() => parseDump(FIXTURE.replace('COMMIT;', "INSERT INTO Books(id,title) VALUES(9,'x') ;\nCOMMIT;")), /line/)
})

test('the real fork dump round-trips byte for byte', { skip: !process.env.ACRONYMIZER_SQL || !existsSync(process.env.ACRONYMIZER_SQL) }, () => {
  const text = readFileSync(process.env.ACRONYMIZER_SQL, 'utf8')
  assert.equal(exportDump(parseDump(text)), text)
})

test('listBooks keeps link order', () => {
  const books = listBooks(parseDump(FIXTURE))
  assert.deepEqual(books[0], { id: 1, title: 'בראשית', aliases: ["בר'", 'ספר בראשית'] })
})

test('normalizeAlias: the form SeforimLibrary and the app read best', () => {
  assert.equal(normalizeAlias('  רַבִּי   עֲקִיבָא\u200F '), 'רבי עקיבא')
  assert.equal(normalizeAlias('רעק״א'), 'רעק"א')
  assert.equal(normalizeAlias("מל''א"), 'מל"א')
  assert.equal(normalizeAlias('ר׳ עקיבא'), "ר' עקיבא")
  assert.equal(normalizeAlias('בית־יוסף'), 'בית יוסף')
  assert.equal(normalizeAlias('“תוס”'), '"תוס"')
})

test('aliasKey ignores quotes the way the app does', () => {
  assert.equal(aliasKey('רעק"א'), aliasKey("רעק'א"))
  assert.equal(aliasKey('רעק"א'), aliasKey('רעקא'))
})

test('aliasKey ignores punctuation the way the app does', () => {
  assert.equal(aliasKey('שו״ע-או״ח'), aliasKey('שו"ע או"ח'))
  assert.equal(aliasKey('רמבם, מסירת תורה שבעל פה'), aliasKey('רמב"ם מסירת תורה-שבעל-פה'))
  assert.equal(aliasKey('אור הישר.'), aliasKey('אור הישר'))
  assert.notEqual(aliasKey('אור הישר'), aliasKey('אור ישר'))
})

test('aliasKey expands amud marks before removing quotes, like FindRef', () => {
  const cases = [
    ['ב.', 'ב א'],
    ['ב:', 'ב ב'],
    ['ברכות קכא.', 'ברכות קכא א'],
    ['ברכות קכאב.', 'ברכות קכאב'],
    ['בְּ. ג:', 'ב א ג ב'],
    ['תוס. נדרים', 'תוס א נדרים'],
    ['תוס\' נדרים', 'תוס נדרים'],
    ['פ"א.', 'פא'],
    ['פ״א.', 'פא'],
    ['פ\'א:', 'פא'],
    ['א.ב.', 'א ב א'],
    ['ברכות ב.,', 'ברכות ב'],
    ['ברכות ב.ג:', 'ברכות ב ג ב'],
    ['שו"ע או"ח א.', 'שוע אוח א א'],
    ['ABC 12_34', 'abc 12 34'],
  ]
  for (const [input, expected] of cases) assert.equal(aliasKey(input), expected, input)
  assert.notEqual(aliasKey('ב.'), aliasKey('ב:'))
  assert.equal(duplicateAlias('תוס. נדרים', ['תוס\' נדרים']), null)
  assert.equal(aliasProblem('שמואל א.', 'שמואל א'), null)
})

test('duplicateAlias finds an existing form the app cannot tell apart', () => {
  assert.equal(duplicateAlias('רמב"ם הל\' שבת', ['רמבם הל שבת', 'רמב"ם שבת']), 'רמבם הל שבת')
  assert.equal(duplicateAlias('רמב"ם שבתות', ['רמב"ם שבת']), null)
  assert.equal(hasQuotes('רמב״ם'), true)
  assert.equal(hasQuotes('רמבם'), false)
})

test('matchesLibraryTitle accepts only names SeforimLibrary looks up', () => {
  const titles = ['פסקי הרא"ש על נדה', 'משנה תורה, הלכות שבת']
  assert.equal(matchesLibraryTitle('פסקי הראש על נדה', titles), true)
  assert.equal(matchesLibraryTitle('משנה תורה  הלכות שבת', titles), true)
  assert.equal(matchesLibraryTitle('פסקי הראש על נידה', titles), false)
  assert.deepEqual(suggestLibraryTitles('פסקי הראש על נידה', titles), ['פסקי הרא"ש על נדה'])
})

test('conflictingTitle finds another book with the same title, ignoring quotes', () => {
  const titles = new Map(['בח', 'בראשית'].map((t) => [aliasKey(t), t]))
  assert.equal(conflictingTitle('ב"ח', 'בן איש חי', titles), 'בח')
  assert.equal(conflictingTitle('בראשית', 'בראשית', titles), null)
  assert.equal(conflictingTitle('בא"ח', 'בן איש חי', titles), null)
})

test('aliasProblem rejects empty, title-equivalent and punctuation-only aliases', () => {
  assert.match(aliasProblem('  ', 'x'), /להזין/)
  assert.match(aliasProblem('בראשית"', 'בראשית'), /זהה לשם הספר/)
  assert.match(aliasProblem('"-"', 'x'), /אות או ספרה/)
  assert.equal(aliasProblem('בר', 'בראשית'), null)
})

test('add, remove and rename produce a minimal canonical diff and drop orphans', () => {
  const base = parseDump(FIXTURE)
  const { state, results } = applyChangeSet(base, [
    { type: 'add', book: 'בראשית', alias: 'בר"ש' },
    { type: 'remove', book: "ספר קנאת ה' צבאות", alias: 'קנאת ה צבאות' },
    { type: 'rename', book: 'תוספות רבי עקיבא איגר על משנה שבת', from: 'תוס רבי עיקבא איגר שבת', to: 'תוס רבי עקיבא איגר שבת' },
  ])
  assert.deepEqual(results.map((r) => r.status), ['applied', 'applied', 'applied'])
  const out = exportDump(state)
  // קנאת ה צבאות ותוס עיקבא נשארו בלי קישור ונמחקו; קישור 7 הוחלף במקומו.
  assert.doesNotMatch(out, /VALUES\(3,'קנאת/)
  assert.doesNotMatch(out, /עיקבא/)
  assert.match(out, /INSERT INTO BookAcronyms\(id,book_id,acronym_id\) VALUES\(7,3,8\);/)
  assert.match(out, /INSERT INTO Acronyms\(id,acronym\) VALUES\(7,'בר"ש'\);\nINSERT INTO Acronyms\(id,acronym\) VALUES\(8,'תוס רבי עקיבא איגר שבת'\);/)
  assert.match(out, /INSERT INTO BookAcronyms\(id,book_id,acronym_id\) VALUES\(8,1,7\);/)
})

test('replaying a change set on a master that already has it is a no-op', () => {
  const ops = [{ type: 'add', book: 'בראשית', alias: 'ברא' }, { type: 'remove', book: 'בראשית', alias: "בר'" }]
  const once = applyChangeSet(parseDump(FIXTURE), ops).state
  const twice = applyChangeSet(once, ops)
  assert.deepEqual(twice.results.map((r) => r.status), ['noop', 'noop'])
  assert.equal(exportDump(twice.state), exportDump(once))
})

test('an alias that differs only in quotes from an existing one is not added twice', () => {
  const { results } = applyChangeSet(parseDump(FIXTURE), [{ type: 'add', book: 'בראשית', alias: 'בר' }])
  assert.equal(results[0].status, 'noop')
})

test('punctuation duplicates are skipped but distinct amud aliases are retained', () => {
  const base = parseDump(dump([[1, 'ספר בדיקה']], [[1, 'תוס\' נדרים']], [[1, 1, 1]]))
  const { ops } = validateChangeSet([
    { type: 'add', book: 'ספר בדיקה', alias: 'תוס-נדרים' },
    { type: 'add', book: 'ספר בדיקה', alias: 'תוס. נדרים' },
    { type: 'add', book: 'ספר בדיקה', alias: 'תוס: נדרים' },
  ], base)
  const { state, results } = applyChangeSet(base, ops)
  assert.deepEqual(results.map((r) => r.status), ['noop', 'applied', 'applied'])
  assert.deepEqual(listBooks(state)[0].aliases, ['תוס\' נדרים', 'תוס. נדרים', 'תוס: נדרים'])
})

test('editing an amud alias does not merge it into a different search key', () => {
  const base = parseDump(dump([[1, 'תוספתא נדרים']], [[1, 'תוס\' נדרים'], [2, 'תוס. נדרים']], [[1, 1, 1], [2, 1, 2]]))
  const { ops } = validateChangeSet([{ type: 'rename', book: 'תוספתא נדרים', from: 'תוס. נדרים', to: 'תוס. נדרים!' }], base)
  const { state, results } = applyChangeSet(base, ops)
  assert.equal(results[0].reason, undefined)
  assert.deepEqual(listBooks(state)[0].aliases, ['תוס\' נדרים', 'תוס. נדרים!'])
  assert.equal(state.links.size, base.links.size)
})

test('renaming onto an existing alias merges instead of duplicating', () => {
  const { state, results } = applyChangeSet(parseDump(FIXTURE), [{ type: 'rename', book: 'בראשית', from: "בר'", to: 'ספר בראשית' }])
  assert.equal(results[0].reason, 'אוחד עם כינוי קיים')
  assert.deepEqual(listBooks(state)[0].aliases, ['ספר בראשית'])
})

test('a new book is created only when marked as new', () => {
  const state = parseDump(FIXTURE)
  assert.match(validateChangeSet([{ type: 'add', book: 'ספר חדש', alias: 'ס"ח' }], state).error, /אינו ברשימה/)
  const { ops } = validateChangeSet([{ type: 'add', book: 'ספר חדש', alias: 'ס"ח', newBook: true }], state)
  const out = exportDump(applyChangeSet(state, ops).state)
  assert.match(out, /INSERT INTO Books\(id,title\) VALUES\(4,'ספר חדש'\);/)
})

test('validateChangeSet normalizes aliases and rejects unknown ones', () => {
  const state = parseDump(FIXTURE)
  assert.deepEqual(validateChangeSet([{ type: 'add', book: 'בראשית', alias: ' בר״ש ' }], state).ops, [{ type: 'add', book: 'בראשית', alias: 'בר"ש' }])
  assert.match(validateChangeSet([{ type: 'remove', book: 'בראשית', alias: 'אין' }], state).error, /לא נמצא/)
  assert.match(validateChangeSet([], state).error, /ריק/)
})

test('planAddAliases adds a variant alias for every title/alias containing the text', () => {
  const books = listBooks(parseDump(FIXTURE))
  const plan = planAddAliases(books, 'עיקבא', 'עקיבה')
  assert.deepEqual(plan, [{ book: 'תוספות רבי עקיבא איגר על משנה שבת', from: 'תוס רבי עיקבא איגר שבת', to: 'תוס רבי עקיבה איגר שבת', problem: null }])
  const byTitle = planAddAliases(books, 'עקיבא', 'עקיבה')
  assert.deepEqual(byTitle.map((p) => [p.from, p.to]), [['תוספות רבי עקיבא איגר על משנה שבת', 'תוספות רבי עקיבה איגר על משנה שבת']])
  assert.deepEqual(planAddAliases(books, '  ', 'x'), [])
})

test('planAddAliases flags a variant that already exists in the book', () => {
  const books = [{ title: 'אותיות דרבי עקיבא', aliases: ['אותיות דרבי עקיבה'] }]
  assert.equal(planAddAliases(books, 'עקיבא', 'עקיבה')[0].problem, 'הכינוי כבר קיים בספר')
})

test('summarizeChangeSet: a before/after table per book, strike-through for removals, no-ops folded', () => {
  const { results } = applyChangeSet(parseDump(FIXTURE), [
    { type: 'add', book: 'בראשית', alias: 'בר' },
    { type: 'add', book: 'בראשית', alias: 'ברא' },
    { type: 'remove', book: 'בראשית', alias: 'ספר בראשית' },
    { type: 'rename', book: "ספר קנאת ה' צבאות", from: 'קנאת ה צבאות', to: 'קנאת ה|צבאות' },
  ])
  const s = summarizeChangeSet(results)
  assert.deepEqual(s.counts, { add: 1, remove: 1, rename: 1, noop: 1 })
  const lines = s.text.split('\n')
  assert.equal(lines[0], '**3 שינויים ב-2 ספרים**: 1 הוספות, 1 מחיקות, 1 עריכות; ועוד 1 ללא השפעה.')
  assert.deepEqual(lines.slice(2, 7), [
    '| ספר | פעולה | לפני | אחרי |',
    '|---|---|---|---|',
    '| **בראשית** | ➕ הוספה |  | `ברא` |',
    '|  | ➖ מחיקה | ~~`ספר בראשית`~~ |  |',
    "| **ספר קנאת ה' צבאות** | ✏️ עריכה | `קנאת ה צבאות` | `קנאת ה\\|צבאות` |",
  ])
  assert.match(s.text, /<details><summary>1 שינויים שכבר היו במצב המבוקש<\/summary>[\s\S]*\| \*\*בראשית\*\* \| ➕ הוספה \|  \| `בר` _\(כבר קיים\)_ \|[\s\S]*<\/details>$/)
})

test('summarizeChangeSet truncates on whole rows and says so', () => {
  const ops = Array.from({ length: 50 }, (_, i) => ({ type: 'add', book: 'בראשית', alias: `כינוי ${i}` }))
  const s = summarizeChangeSet(applyChangeSet(parseDump(FIXTURE), ops).results, { maxLength: 800 })
  assert.ok(s.text.length <= 800)
  assert.match(s.text, /\| `כינוי \d+` \|\n\n… הרשימה קוצרה\./)
  assert.equal(s.counts.add, 50)
})
