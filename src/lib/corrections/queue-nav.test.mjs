import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildQueueQuery, parseNavList, neighbors, appendPage, nextSkip, readNavList, writeNavList, fallbackQuery,
  NAV_KEY, FILTERS_KEY, HIDDEN_KEY, NAV_MAX_AGE_MS,
} from './queue-nav.js'

function memStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }
}

test('buildQueueQuery: ברירת מחדל ושדות ריקים', () => {
  assert.equal(buildQueueQuery(), 'view=queued&sort=version')
  assert.equal(buildQueueQuery({ view: '', sort: '', book: '   ' }), 'view=queued&sort=version')
})

test('buildQueueQuery: כל השדות, ספר מקוצץ, ספרים מוסתרים', () => {
  const q = new URLSearchParams(buildQueueQuery({ view: 'mine', sort: 'oldest', kind: 'free_text', source: 'a/b', book: ' ספר ', reason: 'r', assignee: 'u1', hidden: ['x'] }))
  assert.equal(q.get('view'), 'mine')
  assert.equal(q.get('sort'), 'oldest')
  assert.equal(q.get('kind'), 'free_text')
  assert.equal(q.get('source'), 'a/b')
  assert.equal(q.get('book'), 'ספר')
  assert.equal(q.get('reason'), 'r')
  assert.equal(q.get('assignee'), 'u1')
  assert.deepEqual(JSON.parse(q.get('hideBooks')), ['x'])
})

test('parseNavList: דוחה קלט פגום וישן', () => {
  const now = 1_000_000_000
  assert.equal(parseNavList(null, now), null)
  assert.equal(parseNavList({ query: 'v', ids: 'x', at: now }, now), null)
  assert.equal(parseNavList({ query: 'v', ids: [], at: now - NAV_MAX_AGE_MS - 1 }, now), null)
})

test('parseNavList: מסנן כפילויות וערכים לא תקינים ומתקן total', () => {
  const now = 5
  const n = parseNavList({ query: 'v', ids: ['a', 'a', 3, '', 'b'], total: 1, at: now }, now)
  assert.deepEqual(n.ids, ['a', 'b'])
  assert.equal(n.total, 2)
})

test('neighbors: התחלה, אמצע, סוף, לא נמצא', () => {
  const nav = { ids: ['a', 'b', 'c'], total: 3 }
  assert.deepEqual(neighbors(nav, 'a'), { index: 0, prevId: null, nextId: 'b', total: 3, needMore: false })
  assert.deepEqual(neighbors(nav, 'b'), { index: 1, prevId: 'a', nextId: 'c', total: 3, needMore: false })
  assert.deepEqual(neighbors(nav, 'c'), { index: 2, prevId: 'b', nextId: null, total: 3, needMore: false })
  assert.equal(neighbors(nav, 'z').index, -1)
  assert.equal(neighbors(null, 'a').index, -1)
})

test('neighbors: האחרון שנטען כשבשרת יש עוד → needMore', () => {
  assert.equal(neighbors({ ids: ['a', 'b'], total: 10 }, 'b').needMore, true)
  assert.equal(neighbors({ ids: ['a', 'b'], total: 10 }, 'a').needMore, false)
})

test('appendPage: מצרף בלי כפילויות; עמוד ריק מקבע את הסך', () => {
  const nav = { query: 'v', ids: ['a', 'b'], total: 5, at: 1 }
  const n = appendPage(nav, { items: [{ id: 'b' }, { id: 'c' }], total: 5 })
  assert.deepEqual(n.ids, ['a', 'b', 'c'])
  assert.equal(n.total, 5)
  const empty = appendPage(n, { items: [], total: 5 })
  assert.equal(empty.total, 3)
  assert.equal(neighbors(empty, 'c').needMore, false)
})

test('readNavList/writeNavList: הלוך ושוב, ואחסון שזורק', () => {
  const s = memStorage()
  writeNavList(s, { query: 'view=all', ids: ['a', 'b'], total: 9, at: Date.now() })
  const n = readNavList(s)
  assert.deepEqual(n.ids, ['a', 'b'])
  assert.equal(n.total, 9)
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readNavList(broken), null)
  assert.doesNotThrow(() => writeNavList(broken, n))
  assert.equal(readNavList(memStorage({ [NAV_KEY]: '{bad json' })), null)
})

test('fallbackQuery: מהסינון השמור + ספרים מוסתרים; ברירת מחדל כשאין', () => {
  const session = memStorage({ [FILTERS_KEY]: JSON.stringify({ view: 'mine', book: 'ס' }) })
  const local = memStorage({ [HIDDEN_KEY]: JSON.stringify(['x', 3]) })
  const q = new URLSearchParams(fallbackQuery(session, local))
  assert.equal(q.get('view'), 'mine')
  assert.equal(q.get('book'), 'ס')
  assert.deepEqual(JSON.parse(q.get('hideBooks')), ['x'])
  assert.equal(fallbackQuery(memStorage(), memStorage()), 'view=queued&sort=version')
  assert.equal(fallbackQuery(null, null), 'view=queued&sort=version')
})

test('nextSkip + appendPage: דיווחים שטופלו ויצאו מהתור לא מדולגים', () => {
  // בשרת 150 דיווחים; נטענו 100; בינתיים טופלו 10 מתוך הנטענים (r0..r9) ויצאו מהתור
  const all = Array.from({ length: 150 }, (_, i) => `r${i}`)
  const server = all.slice(10)
  const nav = { query: 'v', ids: all.slice(0, 100), total: 150, at: 1 }
  const skip = nextSkip(nav)
  assert.equal(skip, 50)
  const page = { items: server.slice(skip, skip + 100).map((id) => ({ id })), total: server.length }
  const n = appendPage(nav, page)
  // r100..r109 (שבלי חפיפה היו מדולגים) נכנסים ברצף אחרי r99
  assert.deepEqual(n.ids.slice(99, 111), all.slice(99, 111))
  assert.equal(neighbors(n, 'r99').nextId, 'r100')
})

test('nextSkip: בלי שינוי בתור עדיין מתקדם (החפיפה קטנה מעמוד)', () => {
  const all = Array.from({ length: 300 }, (_, i) => `r${i}`)
  const nav = { query: 'v', ids: all.slice(0, 100), total: 300, at: 1 }
  const skip = nextSkip(nav)
  const n = appendPage(nav, { items: all.slice(skip, skip + 100).map((id) => ({ id })), total: 300 })
  assert.equal(n.ids.length, 150)
  assert.equal(n.total, 300)
})
