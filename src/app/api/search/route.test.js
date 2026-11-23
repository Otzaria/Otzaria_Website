import { beforeEach, expect, test, vi } from 'vitest'

const { pageFind, bookFind } = vi.hoisted(() => ({ pageFind: vi.fn(), bookFind: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Page', () => ({ default: { find: pageFind } }))
vi.mock('@/models/Book', () => ({ default: { find: bookFind } }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(() => true) }))
vi.mock('@/lib/client-ip', () => ({ getClientIp: vi.fn(() => '127.0.0.1') }))

import { GET } from './route'

let pageQuery

beforeEach(() => {
  const pages = Array.from({ length: 50 }, (_, i) => ({
    _id: `p${i}`, pageNumber: i, content: `שלום עולם ${i}`, score: 1,
    book: { name: 'ספר ציבורי', slug: 'public' },
  }))
  pageQuery = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    populate: vi.fn(async () => pages),
  }
  pageFind.mockReset().mockReturnValue(pageQuery)
  bookFind.mockReset().mockReturnValue({ lean: vi.fn(async () => [{ _id: 'hidden' }, { _id: 'owned' }]) })
})

test('עמודי ספרים מוגבלים מוצאים מהחיפוש לפני ההגבלה, וההגבלה נשארת 50', async () => {
  const res = await GET(new Request('http://localhost/api/search?q=שלום'))
  expect(res.status).toBe(200)
  const { success, results } = await res.json()
  expect(success).toBe(true)
  expect(results).toHaveLength(50)
  expect(results[0]).toMatchObject({ bookName: 'ספר ציבורי', bookSlug: 'public', pageNumber: 0 })

  const [filter] = bookFind.mock.calls[0]
  expect(filter.$or).toEqual(expect.arrayContaining([
    { isHidden: true }, { isPrivate: true }, { ownerId: { $exists: true, $ne: null } },
  ]))
  expect(pageFind.mock.calls[0][0]).toEqual({
    $text: { $search: 'שלום' },
    book: { $nin: ['hidden', 'owned'] },
  })
  expect(pageQuery.limit).toHaveBeenCalledWith(50)
})

test('שאילתה קצרה לא ניגשת למסד', async () => {
  const res = await GET(new Request('http://localhost/api/search?q=א'))
  expect(await res.json()).toEqual({ results: [] })
  expect(bookFind).not.toHaveBeenCalled()
})
