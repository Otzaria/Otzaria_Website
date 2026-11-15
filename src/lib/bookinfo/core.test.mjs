import test from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { BOOK_INFO_ALL_COLUMNS, BOOK_INFO_COLUMNS, bookInfoStateFromRows, exportBookInfoCsv, listBookInfo, parseBookInfoCsv } from './csv.js'
import { applyChangeSet, summarizeChangeSet, validateChangeSet } from './changes.js'

const NO_EXTENSION = { topics: null, pubDate: null, pubPlace: null, description: null, proofread: null }

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
    bookName: 'אבן עזרא', authorName: 'אברהם אבן עזרא', generationName: 'ראשונים', subGenerationName: 'אחרוני הראשונים', startYear: 1089, endYear: null, ...NO_EXTENSION,
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
    { bookName: 'אבן עזרא', authorName: '', generationName: null, subGenerationName: null, startYear: null, endYear: null, ...NO_EXTENSION },
    { bookName: 'בראשית רבה', authorName: '', generationName: 'חז"ל', subGenerationName: null, startYear: 300, endYear: 500, ...NO_EXTENSION },
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

// ---- עמודות ההרחבה (topics,pubDate,pubPlace,description,proofread) ----

const EXTENDED = [
  BOOK_INFO_ALL_COLUMNS.join(','),
  '"אבן עזרא","אברהם אבן עזרא","ראשונים","אחרוני הראשונים","1089","","פרשנות;תנ""ך","תרפ""ה","ורשה","שורה ראשונה\nשורה שנייה",""',
  '"שולחן ערוך","רבי יוסף קארו","אחרונים","ראשוני האחרונים","","","הלכה","","","","1"',
  '"שולחן ערוך","רמ""א","אחרונים","ראשוני האחרונים","","","הלכה","","","","1"',
  '',
].join('\n')

test('an 11-column file round-trips unchanged, including a multi-line description', () => {
  const state = parseBookInfoCsv(EXTENDED)
  assert.equal(state.columns, 11)
  const ezra = listBookInfo(state).find((r) => r.bookName === 'אבן עזרא')
  assert.equal(ezra.topics, 'פרשנות;תנ"ך')
  assert.equal(ezra.pubDate, 'תרפ"ה')
  assert.equal(ezra.description, 'שורה ראשונה\nשורה שנייה')
  assert.equal(ezra.proofread, null)
  assert.equal(exportBookInfoCsv(state), EXTENDED)
})

test('a 6-column file stays 6 columns until an extension value is saved', () => {
  const state = parseBookInfoCsv(FIXTURE)
  assert.equal(state.columns, 6)
  assert.equal(exportBookInfoCsv(state).split('\n')[0], BOOK_INFO_COLUMNS.join(','))
  const unchanged = applyChangeSet(state, [{ type: 'update', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { endYear: 1167 } }]).state
  assert.equal(exportBookInfoCsv(unchanged).split('\n')[0], BOOK_INFO_COLUMNS.join(','))

  const { ops } = validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { pubPlace: 'ונציה' } }], state)
  const upgraded = exportBookInfoCsv(applyChangeSet(state, ops).state)
  const [header, ...lines] = upgraded.split('\n')
  assert.equal(header, BOOK_INFO_ALL_COLUMNS.join(','))
  assert.ok(lines.filter(Boolean).every((line) => line.split('","').length === 11))
  assert.equal(listBookInfo(parseBookInfoCsv(upgraded)).find((r) => r.bookName === 'אבן עזרא').pubPlace, 'ונציה')
  assert.equal(exportBookInfoCsv(parseBookInfoCsv(upgraded)), upgraded)
})

test('an 11-column file keeps its format even when every extension value is empty', () => {
  const empty = [BOOK_INFO_ALL_COLUMNS.join(','), '"א","","","","","","","","","",""', ''].join('\n')
  assert.equal(exportBookInfoCsv(parseBookInfoCsv(empty)), empty)
})

test('the header must be exactly 6 or 11 known columns, and records must match it', () => {
  assert.throws(() => parseBookInfoCsv(FIXTURE.replace('endYear', 'endYear,topics')), /header/)
  assert.throws(() => parseBookInfoCsv(EXTENDED.replace('pubPlace', 'pubplace')), /header/)
  assert.throws(() => parseBookInfoCsv(EXTENDED.replace('topics,pubDate', 'pubDate,topics')), /header/)
  assert.throws(() => parseBookInfoCsv(EXTENDED + '"ב","","","","",""\n'), /expected 11 columns/)
  assert.throws(() => parseBookInfoCsv(FIXTURE + '"ב","","","","","","","","","",""\n'), /expected 6 columns/)
})

test('the reader enforces the extension limits', () => {
  const line = (cells) => [BOOK_INFO_ALL_COLUMNS.join(','), cells.map((c) => `"${c}"`).join(','), ''].join('\n')
  const row = (ext) => line(['א', '', '', '', '', '', ...ext])
  assert.doesNotThrow(() => parseBookInfoCsv(row([Array.from({ length: 10 }, (_, i) => `נ${i}`).join(';'), 'x'.repeat(100), 'y'.repeat(100), 'ד'.repeat(4000), '1'])))
  for (const ext of [
    [Array.from({ length: 11 }, (_, i) => `נ${i}`).join(';'), '', '', '', ''],
    ['נ'.repeat(61), '', '', '', ''],
    ['', 'x'.repeat(101), '', '', ''],
    ['', '', 'y'.repeat(101), '', ''],
    ['', '', '', 'ד'.repeat(4001), ''],
    ['', 'תרפ"\nה', '', '', ''],
    ['', '', '', '', '0'],
    ['', '', '', '', 'כן'],
  ]) assert.throws(() => parseBookInfoCsv(row(ext.map((v) => v.replace(/"/g, '""')))), undefined, JSON.stringify(ext).slice(0, 80))
  // רשומה עם \r בתוך תיאור נפסלת כבר בבדיקת סופי השורות של הקובץ
  assert.throws(() => parseBookInfoCsv(row(['', '', '', 'א\r\nב', ''])), /LF/)
})

test('validateChangeSet normalizes the extension fields', () => {
  const state = parseBookInfoCsv(FIXTURE)
  const edit = (updates) => validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates }], state)
  assert.deepEqual(edit({ topics: ' הלכה ;; שבת; הלכה ;' }).ops[0].changes, { topics: 'הלכה;שבת' })
  assert.deepEqual(edit({ description: '  שורה\r\nשנייה\rשלישית  ', pubDate: ' 1925 ', pubPlace: 'ורשה' }).ops[0].changes, { description: 'שורה\nשנייה\nשלישית', pubDate: '1925', pubPlace: 'ורשה' })
  assert.match(edit({ topics: Array.from({ length: 11 }, (_, i) => `נ${i}`).join(';') }).error, /עד 10 נושאים/)
  assert.match(edit({ topics: 'נ'.repeat(61) }).error, /60 תווים/)
  assert.match(edit({ pubDate: 'x'.repeat(101) }).error, /100 תווים/)
  assert.match(edit({ pubPlace: 'א\nב' }).error, /שורה אחת/)
  assert.match(edit({ description: 'ד'.repeat(4001) }).error, /4000 תווים/)
  assert.match(edit({ proofread: '1' }).error, /אינו נערך בטופס/)
  assert.match(edit({ topics: ' ; ' }).error, /אין שינוי/)
})

test('a base-field edit leaves hand-written extension values in the file untouched', () => {
  const header = BOOK_INFO_ALL_COLUMNS.join(',')
  const state = parseBookInfoCsv(`${header}\n"אבן עזרא","","","","","","הלכה ; שבת"," 1925","","רקע \n",""\n`)
  const { ops } = validateChangeSet([{ book: 'אבן עזרא', author: '', updates: { startYear: 1500 } }], state)
  assert.deepEqual(ops[0].changes, { startYear: 1500 })
  assert.equal(listBookInfo(applyChangeSet(state, ops).state)[0].topics, 'הלכה ; שבת')
})

test('an extension edit on one author row is written to every row of the book', () => {
  const state = parseBookInfoCsv(EXTENDED)
  const { ops } = validateChangeSet([{ book: 'שולחן ערוך', author: 'רמ"א', updates: { topics: 'הלכה; פסקים', description: 'רקע' } }], state)
  const { state: next, results } = applyChangeSet(state, ops)
  assert.equal(results[0].status, 'applied')
  const rows = listBookInfo(next).filter((r) => r.bookName === 'שולחן ערוך')
  assert.equal(rows.length, 2)
  for (const row of rows) {
    assert.equal(row.topics, 'הלכה;פסקים')
    assert.equal(row.description, 'רקע')
    assert.equal(row.proofread, '1')
  }
  assert.deepEqual(rows.map((r) => r.authorName).sort(), ['רבי יוסף קארו', 'רמ"א'].sort())
  // שורה מסונכרנת חלקית: הערך כבר בשורה של העריכה אך לא באחות — עדיין מוחל
  const partial = applyChangeSet(next, [{ type: 'update', book: 'שולחן ערוך', author: 'רמ"א', changes: { pubPlace: 'ונציה' }, baseRow: { ...rows[0] } }]).state
  const mixed = new Map([...partial.rows].map(([k, r]) => [k, r.authorName === 'רמ"א' ? r : { ...r, pubPlace: null }]))
  const fixed = applyChangeSet({ columns: 11, rows: mixed }, [{ type: 'update', book: 'שולחן ערוך', author: 'רמ"א', changes: { pubPlace: 'ונציה' }, baseRow: { pubPlace: null } }])
  assert.equal(fixed.results[0].status, 'applied')
  assert.ok(listBookInfo(fixed.state).filter((r) => r.bookName === 'שולחן ערוך').every((r) => r.pubPlace === 'ונציה'))
})

test('an extension edit conflicts when the book value changed since the request', () => {
  const state = parseBookInfoCsv(EXTENDED)
  const { ops } = validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { pubPlace: 'ונציה' } }], state)
  const moved = parseBookInfoCsv(EXTENDED.replace('"ורשה"', '"וילנא"'))
  assert.equal(applyChangeSet(moved, ops).results[0].status, 'conflict')
})

test('PR summary labels the extension fields and renders multi-line text in one cell', () => {
  const state = parseBookInfoCsv(FIXTURE)
  const { ops } = validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { topics: 'פרשנות', description: 'א\nב' } }], state)
  const { text } = summarizeChangeSet(applyChangeSet(state, ops).results)
  assert.match(text, /\| נושאים \| — \| `פרשנות` \|/)
  assert.match(text, /\| רקע על הספר \| — \| א<br>ב \|/)
  const proof = summarizeChangeSet(applyChangeSet(state, [{ type: 'update', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { proofread: '1' } }]).results)
  assert.match(proof.text, /\| עבר הגהה באוצריא \| — \| `1` \|/)
})

test('multi-operation changes use current sibling rows after author renames', () => {
  const state = parseBookInfoCsv(EXTENDED)
  const { state: next, results } = applyChangeSet(state, [
    { book: 'שולחן ערוך', author: 'רמ"א', changes: { authorName: 'רבי משה איסרליש' } },
    { book: 'שולחן ערוך', author: 'רבי יוסף קארו', changes: { topics: 'הלכה;פסקים' } },
  ])
  assert.deepEqual(results.map((result) => result.status), ['applied', 'applied'])
  const rows = listBookInfo(next).filter((row) => row.bookName === 'שולחן ערוך')
  assert.equal(rows.length, 2)
  assert.ok(rows.some((row) => row.authorName === 'רבי משה איסרליש'))
  assert.ok(rows.every((row) => row.topics === 'הלכה;פסקים'))
})
