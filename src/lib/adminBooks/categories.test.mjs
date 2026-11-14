import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBook } from './bookTerms.js'
import {
  DEFAULT_CATEGORY_COLOR, booksByCategory, categoryBooksText, categorySaveResultText, deleteBlockReason, moveBooksLocally, nameLockReason,
  newCategoryRow, planCategorySave, toCategoryRows,
} from './categories.js'

const books = [
  normalizeBook({ id: 'a', category: 'ראשונים' }),
  normalizeBook({ id: 'b', category: 'ראשונים' }),
  normalizeBook({ id: 'c', category: 'אישי - משה', isPrivate: true }),
  normalizeBook({ id: 'd' }),
]
const initial = toCategoryRows([{ name: 'כללי', color: '#eedddd' }, { name: 'ראשונים', color: '#38571a' }, { name: 'חסידות', color: 'bad' }, { name: 'ראשונים', color: '#000000' }])

test('שורות מהשרת: בלי כפילויות ובלי שמות ריקים; צבע לא תקין → ברירת מחדל', () => {
  assert.deepEqual(initial.map((r) => [r.original, r.name, r.color]), [['כללי', 'כללי', '#eedddd'], ['ראשונים', 'ראשונים', '#38571a'], ['חסידות', 'חסידות', DEFAULT_CATEGORY_COLOR]])
  assert.equal(new Set(initial.map((r) => r.key)).size, 3)
})

test('ספרים לפי קטגוריה — בלי אישיים; ספר בלי קטגוריה נספר ב"כללי"', () => {
  const usage = booksByCategory(books)
  assert.deepEqual(usage.get('ראשונים'), ['a', 'b'])
  assert.deepEqual(usage.get('כללי'), ['d'])
  assert.equal(usage.has('אישי - משה'), false)
})

test('בלי שינוי — changed=false ובלי שגיאות', () => {
  const plan = planCategorySave(initial, initial, books)
  assert.equal(plan.changed, false)
  assert.deepEqual(plan.errors, [])
  assert.deepEqual(plan.renames, [])
})

test('שינוי שם: הספרים שבקטגוריה עוברים לשם החדש', () => {
  const rows = initial.map((r) => (r.original === 'ראשונים' ? { ...r, name: ' ראשונים קדמונים ' } : r))
  const plan = planCategorySave(rows, initial, books)
  assert.equal(plan.changed, true)
  assert.deepEqual(plan.renames, [{ from: 'ראשונים', to: 'ראשונים קדמונים', bookIds: ['a', 'b'] }])
  assert.deepEqual(plan.categories.map((c) => c.name), ['כללי', 'ראשונים קדמונים', 'חסידות'])
})

test('שגיאות: שם ריק, כפול, "אישי", ומחיקת קטגוריה שיש בה ספרים', () => {
  const extra = { ...newCategoryRow(), name: 'כללי' }
  const empty = newCategoryRow()
  const personal = { ...newCategoryRow(), name: 'אישי - שלי' }
  const rows = [initial[0], initial[2], extra, empty, personal]
  const plan = planCategorySave(rows, initial, books)
  const messages = plan.errors.map((e) => e.message)
  assert.ok(messages.includes('כבר יש קטגוריה בשם "כללי".'))
  assert.ok(messages.includes('כתוב שם לקטגוריה, או מחק את השורה.'))
  assert.ok(messages.includes('שם שמתחיל ב"אישי" שמור לספרים אישיים.'))
  assert.ok(messages.includes('בקטגוריה "ראשונים" יש ספרים — אי אפשר למחוק אותה.'))
  assert.equal(plan.errors.find((e) => e.message.startsWith('כתוב')).key, empty.key)
})

test('מחיקה: קטגוריה ריקה — מותר; עם ספרים או "כללי" — סיבה בשורה אחת', () => {
  const usage = booksByCategory(books)
  assert.equal(deleteBlockReason(initial[2], usage), null)
  assert.equal(deleteBlockReason(initial[1], usage), 'יש בה 2 ספרים. העבר אותם לקטגוריה אחרת קודם.')
  assert.equal(deleteBlockReason(initial[0], usage), 'זו קטגוריית ברירת המחדל של ספרים חדשים.')
  assert.equal(deleteBlockReason(newCategoryRow(), usage), null)
  const plan = planCategorySave([initial[0], initial[1]], initial, books)
  assert.deepEqual(plan.removed, ['חסידות'])
  assert.deepEqual(plan.errors, [])
})

test('toCategoryRows: אותם מפתחות בכל קריאה (רינדור בשרת ובדפדפן), ושורה חדשה לא מתנגשת בהם', () => {
  const cats = [{ name: 'כללי' }, { name: 'ראשונים' }]
  assert.deepEqual(toCategoryRows(cats).map((r) => r.key), toCategoryRows(cats).map((r) => r.key))
  const keys = new Set(toCategoryRows(cats).map((r) => r.key))
  assert.equal(keys.has(newCategoryRow().key), false)
})

test('"כללי": אי אפשר לשנות לה שם או למחוק אותה — גם כשאין בה ספרים', () => {
  const renamed = initial.map((r) => (r.original === 'כללי' ? { ...r, name: 'שונות' } : r))
  const plan = planCategorySave(renamed, initial, books)
  assert.deepEqual(plan.errors.map((e) => e.key), [initial[0].key])
  assert.equal(nameLockReason(initial[0]), 'default')
  assert.equal(nameLockReason(initial[1]), null)
  const removed = planCategorySave(initial.slice(1), initial, [])
  assert.ok(removed.errors.some((e) => e.message.includes('ברירת המחדל')))
})

test('הספרים לא נטענו: שינוי שם או מחיקה של קטגוריה קיימת — חסומים; קטגוריה חדשה וצבע — מותרים', () => {
  const opts = { booksKnown: false }
  assert.equal(nameLockReason(initial[1], opts), 'unknown-books')
  assert.equal(nameLockReason(newCategoryRow(), opts), null)
  const renamed = initial.map((r) => (r.original === 'ראשונים' ? { ...r, name: 'ראשונים חדש' } : r))
  assert.equal(planCategorySave(renamed, initial, [], opts).errors.length, 1)
  assert.equal(planCategorySave(initial.slice(0, 2), initial, [], opts).errors.length, 1)
  const recolored = initial.map((r) => (r.original === 'ראשונים' ? { ...r, color: '#112233' } : r))
  const added = [...recolored, { ...newCategoryRow(), name: 'חדשה' }]
  const ok = planCategorySave(added, initial, [], opts)
  assert.deepEqual(ok.errors, [])
  assert.equal(ok.changed, true)
})

test('אחרי שינוי שם ושמירה: הספרים עוברים בזיכרון — הספירה עוברת לשם החדש, ומחיקה עדיין חסומה', () => {
  const rows = initial.map((r) => (r.original === 'ראשונים' ? { ...r, name: 'ראשונים קדמונים' } : r))
  const plan = planCategorySave(rows, initial, books)
  const moved = new Map(plan.renames.flatMap((r) => r.bookIds.map((id) => [id, r.to])))
  const after = moveBooksLocally(books, moved)
  const savedRows = toCategoryRows(plan.categories)
  const usage = booksByCategory(after)
  const row = savedRows.find((r) => r.original === 'ראשונים קדמונים')
  assert.equal(usage.get('ראשונים קדמונים').length, 2)
  assert.equal(deleteBlockReason(row, usage), 'יש בה 2 ספרים. העבר אותם לקטגוריה אחרת קודם.')
  // שינוי שם נוסף מעביר אותם שוב
  const again = planCategorySave(savedRows.map((r) => (r.key === row.key ? { ...r, name: 'ג' } : r)), savedRows, after)
  assert.deepEqual(again.renames, [{ from: 'ראשונים קדמונים', to: 'ג', bookIds: ['a', 'b'] }])
  assert.equal(moveBooksLocally(books, new Map()), books)
})

test('שמירה שנכשלה באמצע — ההודעה אומרת כמה עברו ושהרשימה לא נשמרה', () => {
  assert.deepEqual(categorySaveResultText({ total: 0, moved: 0, listSaved: true }), { tone: 'success', message: 'הקטגוריות נשמרו.' })
  assert.equal(categorySaveResultText({ total: 3, moved: 3, listSaved: true }).message, 'הקטגוריות נשמרו, ו-3 ספרים עברו לשם החדש.')
  const partial = categorySaveResultText({ total: 500, moved: 120, listSaved: false })
  assert.equal(partial.tone, 'error')
  assert.match(partial.message, /^120 מתוך 500 ספרים עברו לשם החדש, והקטגוריות עוד לא נשמרו/)
  assert.equal(categoryBooksText(0), 'אין ספרים')
  assert.equal(categoryBooksText(1), 'ספר אחד')
})
