// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
vi.mock('next-auth', () => ({ getServerSession: vi.fn().mockResolvedValue(null) }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))
vi.mock('@/models/Book', () => ({ default: { findOne: vi.fn() } }))
import Book from '@/models/Book'
import { getServerSession } from 'next-auth'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// החסימה של תיקיות פרטיות ב-/uploads נבדקת אחרי resolve: מקטע מקודד (%2F..%2F), לוכסן-הפוך או רישיות
// לא עוקפים אותה. UPLOAD_DIR — תיקייה זמנית, לפני טעינת הראוט (UPLOAD_ROOT נקבע בטעינה).
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uploads-route-'))
process.env.UPLOAD_DIR = root
fs.mkdirSync(path.join(root, 'tzurat-hadaf', 'berakhot'), { recursive: true })
fs.writeFileSync(path.join(root, 'tzurat-hadaf', 'berakhot', '002a.scan.png'), 'x')
fs.mkdirSync(path.join(root, 'books'), { recursive: true })
fs.writeFileSync(path.join(root, 'books', 'a.txt'), 'ok')

let GET
beforeAll(async () => {
  ;({ GET } = await import('./route'))
})
afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const call = (segments) => GET(new Request('http://localhost/uploads/x'), { params: Promise.resolve({ path: segments }) })

describe('GET /uploads/[...path] — תיקיות חסומות', () => {
  it('קובץ רגיל מוגש', async () => {
    expect((await call(['books', 'a.txt'])).status).toBe(200)
  })

  it('סריקה של ספר פרטי ישן אינה זמינה לאחר, גם עם כותרת מטמון', async () => {
    fs.mkdirSync(path.join(root, 'books', 'private'), { recursive: true })
    fs.writeFileSync(path.join(root, 'books', 'private', 'page.1.jpg'), 'image')
    Book.findOne.mockReturnValue({ lean: async () => ({ isPrivate: true, ownerId: 'owner' }) })
    getServerSession.mockResolvedValue({ user: { id: 'other', role: 'private_ocr' } })
    expect((await call(['books', 'private', 'page.1.jpg'])).status).toBe(404)
    getServerSession.mockResolvedValue({ user: { role: 'admin' } })
    const res = await call(['books', 'private', 'page.1.jpg'])
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })

  it('חסום ישירות, ברישיות אחרת ובלוכסן-הפוך', async () => {
    for (const segs of [['tzurat-hadaf', 'berakhot', '002a.scan.png'], ['TZURAT-HADAF', 'berakhot', '002a.scan.png'], ['tzurat-hadaf\\berakhot\\002a.scan.png']]) {
      expect((await call(segs)).status, segs.join('/')).toBe(403)
    }
  })

  it('מקטע מפוענח עם ../ (מ-%2F..%2F) — עדיין חסום', async () => {
    for (const segs of [['books/../tzurat-hadaf/berakhot/002a.scan.png'], ['x', '..', 'tzurat-hadaf', 'berakhot', '002a.scan.png'], ['books\\..\\Tzurat-Hadaf', 'berakhot', '002a.scan.png']]) {
      expect((await call(segs)).status, segs.join('/')).toBe(403)
    }
  })

  it('יציאה מהשורש — 403', async () => {
    expect((await call(['..', '..', 'etc', 'passwd'])).status).toBe(403)
  })
})
