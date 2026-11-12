// @vitest-environment node
import { beforeEach, test, expect, vi } from 'vitest'
const { getSession, findBook, findPage, updatePage } = vi.hoisted(() => ({ getSession: vi.fn(), findBook: vi.fn(), findPage: vi.fn(), updatePage: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: getSession }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/models/Book', () => ({ default: { findOne: findBook, findById: findBook } }))
vi.mock('@/models/Page', () => ({ default: { findOne: findPage, findOneAndUpdate: updatePage } }))
import { GET, POST } from './route'

let book
let page
beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue({ user: { id: 'u', role: 'admin_books_only' } })
  book = { _id: 'b', slug: 'book', name: 'ספר', ownerId: 'other' }
  page = { _id: 'p', book: 'b', pageNumber: 1, status: 'available', content: 'תוכן', imagePath: '/uploads/book.png' }
  findBook.mockImplementation(async () => book)
  findPage.mockImplementation(async () => page)
  updatePage.mockImplementation(async () => page)
})
const read = () => GET(new Request('https://site.test/api/page-content?bookPath=book&pageNumber=1'))
const save = () => POST(new Request('https://site.test/api/page-content', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bookPath: 'book', pageNumber: 1, content: 'תיקון', twoColumns: false }),
}))

test.each(['isHidden', 'isPrivate'])('a book-library administrator can read and save a restricted %s book', async restriction => {
  book[restriction] = true
  expect((await read()).status).toBe(200)
  expect((await save()).status).toBe(200)
  expect(updatePage).toHaveBeenCalledTimes(1)
})

test.each(['user', 'admin_plugins', 'admin_ocr', 'developer'])('the same restricted book remains forbidden to %s', async role => {
  book.isHidden = true
  getSession.mockResolvedValue({ user: { id: 'u', role } })
  expect((await read()).status).toBe(403)
  expect((await save()).status).toBe(403)
  expect(updatePage).not.toHaveBeenCalled()
})

test('the private-book owner retains access without an administrative role', async () => {
  book.isPrivate = true; book.ownerId = 'u'
  getSession.mockResolvedValue({ user: { id: 'u', role: 'user' } })
  expect((await read()).status).toBe(200)
  expect((await save()).status).toBe(200)
})

test('a library administrator can edit another holder’s page, but a normal user cannot', async () => {
  page.status = 'in-progress'; page.claimedBy = 'other'
  expect((await read()).status).toBe(200)
  expect((await save()).status).toBe(200)
  getSession.mockResolvedValue({ user: { id: 'u', role: 'user' } })
  expect((await read()).status).toBe(403)
  expect((await save()).status).toBe(403)
  expect(updatePage).toHaveBeenCalledTimes(1)
})
