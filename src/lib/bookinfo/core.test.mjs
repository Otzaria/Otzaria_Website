import test from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { bookInfoStateFromRows, exportBookInfoCsv, listBookInfo, parseBookInfoCsv } from './csv.js'
import { applyChangeSet, summarizeChangeSet, validateChangeSet } from './changes.js'

const FIXTURE = [
  'bookName,authorName,generationName,subGenerationName,startYear,endYear',
  '"בראשית רבה","","חז""ל","אמוראים","300","500"',
  '"אבן עזרא","אברהם אבן עזרא","ראשונים","אחרוני הראשונים","1089",""',
  '"ספר, עם פסיק","מחבר ""מצוטט""","","","",""',
  '',
].join('\n')

test('parse reads quoted fields, empty values as null and years as numbers', () => {
  const rows = listBookInfo(parseBookInfoCsv(FIXTURE))
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.find((r) => r.bookName === 'אבן עזרא'), {
    bookName: 'אבן עזרא', authorName: 'אברהם אבן עזרא', generationName: 'ראשונים', subGenerationName: 'אחרוני הראשונים', startYear: 1089, endYear: null,
  })
  const quoted = rows.find((r) => r.bookName === 'ספר, עם פסיק')
  assert.equal(quoted.authorName, 'מחבר "מצוטט"')
  assert.equal(quoted.generationName, null)
})

test('export is canonical: sorted, all quoted, LF, and stable across a round trip', () => {
  const out = exportBookInfoCsv(parseBookInfoCsv(FIXTURE))
  assert.equal(out.split('\n')[1], '"אבן עזרא","אברהם אבן עזרא","ראשונים","אחרוני הראשונים","1089",""')
  assert.ok(out.endsWith('\n') && !out.includes('\r'))
  assert.equal(exportBookInfoCsv(parseBookInfoCsv(out)), out)
})

test('parse rejects CRLF, a wrong header, duplicates and non-integer years', () => {
  assert.throws(() => parseBookInfoCsv(FIXTURE.replace(/\n/g, '\r\n')), /LF/)
  assert.throws(() => parseBookInfoCsv('a,b\n'), /header/)
  assert.throws(() => parseBookInfoCsv(FIXTURE + '"בראשית רבה","","","","",""\n'), /duplicate/)
  assert.throws(() => parseBookInfoCsv(FIXTURE.replace('"1089"', '"x"')), /integer/)
})

test('rows from Mongo export to a file the parser reads back unchanged', () => {
  const mongoRows = [
    { _id: 'x', bookName: 'בראשית רבה', authorName: '', generationName: 'חז"ל', subGenerationName: '', startYear: 300, endYear: 500 },
    { _id: 'y', bookName: 'אבן עזרא', generationName: null, startYear: null },
  ]
  const csv = exportBookInfoCsv(bookInfoStateFromRows(mongoRows))
  assert.ok(!csv.startsWith(String.fromCharCode(0xfeff)))
  assert.deepEqual(listBookInfo(parseBookInfoCsv(csv)), [
    { bookName: 'אבן עזרא', authorName: '', generationName: null, subGenerationName: null, startYear: null, endYear: null },
    { bookName: 'בראשית רבה', authorName: '', generationName: 'חז"ל', subGenerationName: null, startYear: 300, endYear: 500 },
  ])
  assert.throws(() => bookInfoStateFromRows([...mongoRows, { bookName: 'אבן עזרא', authorName: '' }]), /duplicate/)
  assert.throws(() => bookInfoStateFromRows([{ bookName: 'א', startYear: 1.5 }]), /integer/)
})

test('validateChangeSet keeps only the changed fields and checks the generation pair', () => {
  const state = parseBookInfoCsv(FIXTURE)
  const ok = validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { startYear: '1090', generationName: 'ראשונים' } }], state)
  assert.deepEqual(ok.ops.map(({ baseRow, ...op }) => op), [{ type: 'update', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { startYear: 1090 } }])
  assert.match(validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { subGenerationName: 'אמוראים' } }], state).error, /דור המשנה/)
  assert.match(validateChangeSet([{ book: 'אין כזה', author: '', updates: { startYear: 1 } }], state).error, /אינו ברשימה/)
  assert.match(validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { startYear: 1089 } }], state).error, /אין שינוי/)
  assert.match(validateChangeSet([], state).error, /ריק/)
  // שם הספר הוא המפתח לספר בספרייה ואינו נערך; שליחתו כמו שהוא (כמו שהטופס שולח) אינה שינוי
  assert.match(validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { bookName: 'אבן עזרא החדש' } }], state).error, /שם הספר/)
  assert.deepEqual(validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { bookName: 'אבן עזרא', endYear: 1167 } }], state).ops[0].changes, { endYear: 1167 })
  // תורה שבכתב: אחד מחמשת הדורות של האפליקציה, בלי דורות משנה
  assert.deepEqual(validateChangeSet([{ book: 'בראשית רבה', author: '', updates: { generationName: 'תורה שבכתב', subGenerationName: '' } }], state).ops[0].changes, { generationName: 'תורה שבכתב', subGenerationName: null })
  assert.match(validateChangeSet([{ book: 'בראשית רבה', author: '', updates: { generationName: 'תורה שבכתב' } }], state).error, /דור המשנה/)
})

test('applyChangeSet updates rows, no-ops what is already there, and refuses a rename onto an existing book', () => {
  const state = parseBookInfoCsv(FIXTURE)
  const { state: next, results } = applyChangeSet(state, [
    { type: 'update', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { endYear: 1167 } },
    { type: 'update', book: 'בראשית רבה', author: '', changes: { startYear: 300 } },
    { type: 'update', book: 'נעלם', author: '', changes: { startYear: 1 } },
    { type: 'update', book: 'בראשית רבה', author: '', changes: { bookName: 'אבן עזרא', authorName: 'אברהם אבן עזרא' } },
  ])
  assert.deepEqual(results.map((r) => r.status), ['applied', 'noop', 'conflict', 'conflict'])
  assert.deepEqual(results[0].before, { endYear: null })
  assert.equal(listBookInfo(next).find((r) => r.bookName === 'אבן עזרא').endYear, 1167)
  assert.equal(listBookInfo(state).find((r) => r.bookName === 'אבן עזרא').endYear, null)
})

test('applyChangeSet supports renaming a book and clearing a field', () => {
  const state = parseBookInfoCsv(FIXTURE)
  const { state: next } = applyChangeSet(state, [
    { type: 'update', book: 'בראשית רבה', author: '', changes: { bookName: 'מדרש בראשית רבה', subGenerationName: null } },
  ])
  const row = listBookInfo(next).find((r) => r.bookName === 'מדרש בראשית רבה')
  assert.equal(row.subGenerationName, null)
  assert.equal(listBookInfo(next).length, 3)
})

test('summarizeChangeSet: a before/after table per field, no-ops folded', () => {
  const { results } = applyChangeSet(parseBookInfoCsv(FIXTURE), [
    { type: 'update', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { endYear: 1167, generationName: 'אחרונים', subGenerationName: 'ראשוני האחרונים' } },
    { type: 'update', book: 'נעלם', author: '', changes: { startYear: 1 } },
  ])
  const s = summarizeChangeSet(results)
  assert.deepEqual(s.counts, { update: 1, noop: 1 })
  assert.match(s.text, /\| \*\*אבן עזרא\*\* _\(אברהם אבן עזרא\)_ \| דור \| `ראשונים` \| `אחרונים` \|/)
  assert.match(s.text, /\| {2}\| עד שנה \| — \| `1167` \|/)
  assert.match(s.text, /<details><summary>1 שינויים/)
})

test('summarizeChangeSet truncates on whole rows and says so', () => {
  const ops = Array.from({ length: 30 }, (_, i) => ({ type: 'update', book: `ספר ${i}`, author: '', changes: { startYear: i } }))
  const csv = ['bookName,authorName,generationName,subGenerationName,startYear,endYear', ...ops.map((o) => `"${o.book}","","","","",""`), ''].join('\n')
  const { results } = applyChangeSet(parseBookInfoCsv(csv), ops)
  const s = summarizeChangeSet(results, { maxLength: 900 })
  assert.ok(s.text.length <= 900)
  assert.match(s.text, /הרשימה קוצרה/)
})

test('PR Markdown preserves literal user text and four table cells with backslashes, pipes and markup', () => {
  const values = ['A|B', 'A\\|B', 'A\\\\|B', 'A\\B', '`quoted` **bold** _italic_ [link](url) <tag>', 'first\nsecond']
  const text = (node) => node.type === 'html' && node.value === '<br>' ? '\n' : node.value ?? (node.children || []).map(text).join('')
  for (const value of values) {
    const summary = summarizeChangeSet([{
      status: 'applied', op: { book: value, author: value, changes: { authorName: value } },
      before: { authorName: value }, after: { authorName: value },
    }])
    const ast = unified().use(remarkParse).use(remarkGfm).parse(summary.text)
    const table = ast.children.find((node) => node.type === 'table')
    assert.equal(table.children.length, 2, value)
    const cells = table.children[1].children
    assert.equal(cells.length, 4, value)
    assert.equal(text(cells[0]), `${value} (${value})`, value)
    assert.equal(text(cells[2]), value, value)
    assert.equal(text(cells[3]), value, value)
    assert.equal(cells[0].children[0].type, 'strong')
    assert.equal(cells[0].children[0].children.every((node) => node.type === 'text' || node.type === 'html'), true)
  }
  const summary = summarizeChangeSet([{ status: 'conflict', reason: 'changed\\|row\ncheck', op: { book: 'book', author: '', changes: { startYear: 1 } } }])
  const ast = unified().use(remarkParse).use(remarkGfm).parse(summary.text)
  const table = ast.children.find((node) => node.type === 'table')
  assert.equal(table.children[1].children.length, 4)
  assert.equal(text(table.children[1].children[3]), '1 (changed\\|row\ncheck)')
})

test('storage invariant rejects fractions, exponents, overflow, booleans, CR and NUL before publication', () => {
  for (const updates of [{ startYear: 100.5 }, { endYear: 1e21 }, { endYear: 2147483648 }, { endYear: '1e3' }, { endYear: true }, { authorName: 'A\rB' }, { authorName: 'A\0B' }]) {
    assert.ok(validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates }], parseBookInfoCsv(FIXTURE)).error)
  }
  assert.throws(() => parseBookInfoCsv(FIXTURE.replace('"1089"', '"999999999999999999999"')), /32-bit/)
  assert.throws(() => exportBookInfoCsv({ rows: new Map([['x', { bookName: 'x', authorName: 'A\rB' }]]) }), /unsupported/)
})

test('rebase detects touched-field lost update and validates the complete rebased row', () => {
  const original = parseBookInfoCsv(FIXTURE)
  const { ops } = validateChangeSet([{ book: 'בראשית רבה', author: '', updates: { endYear: 501 } }], original)
  const touched = parseBookInfoCsv(FIXTURE.replace('"300","500"', '"300","502"'))
  assert.equal(applyChangeSet(touched, ops).results[0].status, 'conflict')
  const invalid = parseBookInfoCsv(FIXTURE.replace('"300","500"', '"600","700"'))
  assert.equal(applyChangeSet(invalid, ops).results[0].status, 'conflict')
  assert.equal(listBookInfo(applyChangeSet(invalid, ops).state).find((r) => r.bookName === 'בראשית רבה').endYear, 700)
})

test('canonical sort matches Python code point ordering for astral author names', () => {
  const rows = [{ bookName: 'same', authorName: '😀' }, { bookName: 'same', authorName: '\ue000' }]
  const csv = exportBookInfoCsv(bookInfoStateFromRows(rows))
  assert.ok(csv.indexOf('\ue000') < csv.indexOf('😀'))
})

test('the reader rejects malformed quoting and the full semantic/storage contract', () => {
  for (const csv of [FIXTURE.replace('"1089"', '"1089"junk'), FIXTURE.replace('"1089"', '10"89'), FIXTURE.replace('"1089"', '"2147483648"'), FIXTURE.replace('"300","500"', '"600","500"'), FIXTURE.replace('"אמוראים"', '"גאונים"'), FIXTURE.replace('"ראשונים"', '"unknown"'), FIXTURE.replace('אברהם אבן עזרא', 'A\ufeffB'), FIXTURE + '\n']) assert.throws(() => parseBookInfoCsv(csv))
})

test('lone UTF16 surrogates are rejected before UTF8 can change a published identity', () => {
  assert.ok(validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { authorName: 'A\ud800B' } }], parseBookInfoCsv(FIXTURE)).error)
  assert.throws(() => exportBookInfoCsv({ rows: new Map([['x', { bookName: 'x', authorName: 'A\ud800B' }]]) }), /unsupported/)
})
