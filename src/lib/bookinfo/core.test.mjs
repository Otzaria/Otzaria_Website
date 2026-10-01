import test from 'node:test'
import assert from 'node:assert/strict'
import { exportBookInfoCsv, listBookInfo, parseBookInfoCsv } from './csv.js'
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

test('validateChangeSet keeps only the changed fields and checks the generation pair', () => {
  const state = parseBookInfoCsv(FIXTURE)
  const ok = validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { startYear: '1090', generationName: 'ראשונים' } }], state)
  assert.deepEqual(ok.ops, [{ type: 'update', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { startYear: 1090 } }])
  assert.match(validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { subGenerationName: 'אמוראים' } }], state).error, /דור המשנה/)
  assert.match(validateChangeSet([{ book: 'אין כזה', author: '', updates: { startYear: 1 } }], state).error, /אינו ברשימה/)
  assert.match(validateChangeSet([{ book: 'אבן עזרא', author: 'אברהם אבן עזרא', updates: { startYear: 1089 } }], state).error, /אין שינוי/)
  assert.match(validateChangeSet([], state).error, /ריק/)
})

test('applyChangeSet updates rows, no-ops what is already there, and refuses a rename onto an existing book', () => {
  const state = parseBookInfoCsv(FIXTURE)
  const { state: next, results } = applyChangeSet(state, [
    { type: 'update', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { endYear: 1167 } },
    { type: 'update', book: 'בראשית רבה', author: '', changes: { startYear: 300 } },
    { type: 'update', book: 'נעלם', author: '', changes: { startYear: 1 } },
    { type: 'update', book: 'בראשית רבה', author: '', changes: { bookName: 'אבן עזרא', authorName: 'אברהם אבן עזרא' } },
  ])
  assert.deepEqual(results.map((r) => r.status), ['applied', 'noop', 'noop', 'noop'])
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
    { type: 'update', book: 'אבן עזרא', author: 'אברהם אבן עזרא', changes: { endYear: 1167, generationName: 'אחרונים' } },
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
