/** בדיקות סל השינויים בדף הכינויים. הרצה: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addToBasket, basketOps, bookView, filterBooks, removeFromBasket } from './basket.js'

const B = 'ברכות'

test('adding then removing the same new alias cancels out', () => {
  let basket = addToBasket([], { type: 'add', book: B, alias: 'ברכ' })
  basket = addToBasket(basket, { type: 'remove', book: B, alias: 'ברכ' })
  assert.deepEqual(basket, [])
})

test('removing then re-adding an existing alias cancels out', () => {
  let basket = addToBasket([], { type: 'remove', book: B, alias: 'ברכ' })
  basket = addToBasket(basket, { type: 'add', book: B, alias: 'ברכ' })
  assert.deepEqual(basket, [])
})

test('an add is normalized and not duplicated by a quote variant', () => {
  let basket = addToBasket([], { type: 'add', book: B, alias: ' בר״כ ' })
  basket = addToBasket(basket, { type: 'add', book: B, alias: "בר'כ" })
  assert.deepEqual(basketOps(basket), [{ type: 'add', book: B, alias: 'בר"כ' }])
})

test('renaming a basket-only alias edits the add itself', () => {
  let basket = addToBasket([], { type: 'add', book: B, alias: 'ברכ' })
  basket = addToBasket(basket, { type: 'rename', book: B, from: 'ברכ', to: 'ברכו' })
  assert.deepEqual(basketOps(basket), [{ type: 'add', book: B, alias: 'ברכו' }])
})

test('renaming twice keeps one rename, and renaming back drops it', () => {
  let basket = addToBasket([], { type: 'rename', book: B, from: 'א', to: 'ב' })
  basket = addToBasket(basket, { type: 'rename', book: B, from: 'ב', to: 'ג' })
  assert.deepEqual(basketOps(basket), [{ type: 'rename', book: B, from: 'א', to: 'ג' }])
  basket = addToBasket(basket, { type: 'rename', book: B, from: 'ג', to: 'א' })
  assert.deepEqual(basket, [])
})

test('deleting a renamed alias becomes a delete of the original', () => {
  let basket = addToBasket([], { type: 'rename', book: B, from: 'א', to: 'ב' })
  basket = addToBasket(basket, { type: 'remove', book: B, alias: 'ב' })
  assert.deepEqual(basketOps(basket), [{ type: 'remove', book: B, alias: 'א' }])
})

test('bookView shows the book as it will be after the basket', () => {
  const basket = [
    { type: 'remove', book: B, alias: 'א' },
    { type: 'rename', book: B, from: 'ב', to: 'ב2' },
    { type: 'add', book: B, alias: 'ד' },
    { type: 'add', book: 'אחר', alias: 'ה' },
  ]
  assert.deepEqual(bookView(['א', 'ב', 'ג'], basket, B), [
    { text: 'א', state: 'removed' },
    { text: 'ב2', from: 'ב', state: 'renamed' },
    { text: 'ג', state: 'kept' },
    { text: 'ד', state: 'added' },
  ])
})

test('removeFromBasket drops one item by index', () => {
  assert.deepEqual(removeFromBasket([1, 2, 3], 1), [1, 3])
})

test('filterBooks matches titles and aliases regardless of quotes', () => {
  const books = [{ title: 'רעק"א', aliases: [] }, { title: 'ברכות', aliases: ['בר"כ'] }, { title: 'שבת', aliases: [] }]
  assert.deepEqual(filterBooks(books, 'רעקא').map((b) => b.title), ['רעק"א'])
  assert.deepEqual(filterBooks(books, "בר'כ").map((b) => b.title), ['ברכות'])
  assert.equal(filterBooks(books, '  ').length, 3)
})
