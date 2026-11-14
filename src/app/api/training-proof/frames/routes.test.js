import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// נתיבי /api/training-proof/frames/*: כל נתיב עובר בשער (401/403 כמו שהוא), מזהים לא תקינים נדחים
// לפני המסד, תוצאות framesDb הופכות לתשובות (409 עם ההסבר), גוף לא תקין — 400, והתמונה — רק למי
// שמחזיק את הספר. השער ו-framesDb מדומים; הלוגיקה עצמה נבדקת מול Mongo ב-framesDb.int.test.mjs.

const { gateMock, db, readImage } = vi.hoisted(() => ({
  gateMock: vi.fn(),
  db: {
    listBooks: vi.fn(),
    bookDetail: vi.fn(),
    claimBook: vi.fn(),
    releaseBook: vi.fn(),
    addStream: vi.fn(),
    setStreamKind: vi.fn(),
    savePage: vi.fn(),
    pageImagePath: vi.fn(),
  },
  readImage: vi.fn(),
}))
vi.mock('@/lib/trainingProof/access', () => ({ requireTrainingProofSession: gateMock }))
vi.mock('./_lib/framesDb', () => db)
vi.mock('@/lib/ocr/images', () => ({ readPageImage: readImage }))

import { GET as listGET } from './books/route'
import { GET as bookGET } from './books/[book]/route'
import { POST as claimPOST } from './books/[book]/claim/route'
import { POST as releasePOST } from './books/[book]/release/route'
import { POST as streamsPOST } from './books/[book]/streams/route'
import { PATCH as streamPATCH } from './books/[book]/streams/[stream]/route'
import { PUT as pagePUT } from './pages/[id]/route'
import { GET as imageGET } from './pages/[id]/image/route'

const U = '64b7f0c2a1b2c3d4e5f60003'
const PAGE = '64b7f0c2a1b2c3d4e5f60009'
const BOOK = 'b-a7f3310c6e'
const params = (p) => ({ params: Promise.resolve(p) })
const req = (body, url = 'http://x/api') => ({ url, text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)) })

beforeEach(() => {
  vi.clearAllMocks()
  gateMock.mockResolvedValue({ userId: U, isAdmin: false, access: 'approved' })
})

describe('השער', () => {
  it.each([
    ['list', () => listGET()],
    ['book', () => bookGET(req(), params({ book: BOOK }))],
    ['claim', () => claimPOST(req(), params({ book: BOOK }))],
    ['stream kind', () => streamPATCH(req({ role: 'notes' }), params({ book: BOOK, stream: 'x1' }))],
    ['page', () => pagePUT(req({}), params({ id: PAGE }))],
    ['image', () => imageGET(req(null), params({ id: PAGE }))],
  ])('%s — בלי גישה: 403 כמו שהשער החזיר, בלי לגעת במסד', async (_, call) => {
    gateMock.mockResolvedValue({ error: NextResponse.json({ success: false, error: 'אין לך הרשאת גישה לדף זה', access: 'none' }, { status: 403 }) })
    const r = await call()
    expect(r.status).toBe(403)
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
    expect(Object.values(db).every((f) => f.mock.calls.length === 0)).toBe(true)
  })
})

describe('ספרים', () => {
  it('רשימה', async () => {
    db.listBooks.mockResolvedValue({ ok: true, books: [{ book: BOOK, state: 'free' }] })
    const r = await listGET()
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ success: true, books: [{ book: BOOK, state: 'free' }] })
    expect(db.listBooks).toHaveBeenCalledWith(U)
  })

  it('מזהה ספר לא תקין — 400 לפני המסד', async () => {
    for (const call of [bookGET, claimPOST, releasePOST, streamsPOST]) {
      const r = await call(req({ name: 'x', role: 'body' }), params({ book: '../etc' }))
      expect(r.status).toBe(400)
    }
    expect(db.bookDetail).not.toHaveBeenCalled()
    expect(db.claimBook).not.toHaveBeenCalled()
  })

  it('לקיחה שנכשלה — 409 עם ההסבר', async () => {
    db.claimBook.mockResolvedValue({ ok: false, status: 409, error: 'הספר בעבודה אצל מתנדב אחר' })
    const r = await claimPOST(req(), params({ book: BOOK }))
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe('הספר בעבודה אצל מתנדב אחר')
  })

  it('מנהל רואה ספר גם בלי לקחת אותו (סקירה)', async () => {
    gateMock.mockResolvedValue({ userId: U, isAdmin: true, access: 'admin' })
    db.bookDetail.mockResolvedValue({ ok: true, book: { book: BOOK }, pages: [] })
    await bookGET(req(), params({ book: BOOK }))
    expect(db.bookDetail).toHaveBeenCalledWith(U, BOOK, { isAdmin: true })
  })

  it('זרם חדש — גוף לא תקין 400; תקין עובר הלאה', async () => {
    expect((await streamsPOST(req('not json'), params({ book: BOOK }))).status).toBe(400)
    db.addStream.mockResolvedValue({ ok: true, stream: { id: 'x1' }, streams: [] })
    const r = await streamsPOST(req({ name: 'הגהות', role: 'notes' }), params({ book: BOOK }))
    expect(r.status).toBe(200)
    expect(db.addStream).toHaveBeenCalledWith(U, BOOK, { name: 'הגהות', role: 'notes' })
  })

  it('שינוי סוג של זרם: מזהה לא תקין — 400 לפני המסד; תוצאה — כמו שהיא (409 עם ההסבר)', async () => {
    expect((await streamPATCH(req({ role: 'notes' }), params({ book: BOOK, stream: '../x' }))).status).toBe(400)
    expect((await streamPATCH(req('not json'), params({ book: BOOK, stream: 'x1' }))).status).toBe(400)
    expect(db.setStreamKind).not.toHaveBeenCalled()
    db.setStreamKind.mockResolvedValue({ ok: true, stream: { id: 'x1', role: 'commentary' }, streams: [], pages: 2 })
    const r = await streamPATCH(req({ role: 'commentary' }), params({ book: BOOK, stream: 'x1' }))
    expect(r.status).toBe(200)
    expect((await r.json()).pages).toBe(2)
    expect(db.setStreamKind).toHaveBeenCalledWith(U, BOOK, 'x1', { role: 'commentary' })
    db.setStreamKind.mockResolvedValue({ ok: false, status: 409, error: 'עמוד אחד עם הזרם הזה כבר אושר' })
    const bad = await streamPATCH(req({ role: 'commentary' }), params({ book: BOOK, stream: 'x1' }))
    expect(bad.status).toBe(409)
    expect((await bad.json()).error).toMatch(/אושר/)
  })

  it('שחרור', async () => {
    db.releaseBook.mockResolvedValue({ ok: true })
    expect((await releasePOST(req(), params({ book: BOOK }))).status).toBe(200)
  })
})

describe('שמירת עמוד', () => {
  it('מזהה לא תקין / גוף לא תקין — 400', async () => {
    expect((await pagePUT(req({}), params({ id: 'nope' }))).status).toBe(400)
    expect((await pagePUT(req('{'), params({ id: PAGE }))).status).toBe(400)
    expect(db.savePage).not.toHaveBeenCalled()
  })

  it('גוף גדול מדי — 413', async () => {
    const r = await pagePUT(req('x'.repeat(300 * 1024)), params({ id: PAGE }))
    expect(r.status).toBe(413)
  })

  it('סימון נשמר, והתשובה מחזירה את העמוד', async () => {
    db.savePage.mockResolvedValue({ ok: true, page: { id: PAGE, state: 'marked' }, bookDone: false })
    const body = { status: 'marked', frames: [] }
    const r = await pagePUT(req(body), params({ id: PAGE }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ success: true, page: { id: PAGE, state: 'marked' }, bookDone: false })
    expect(db.savePage).toHaveBeenCalledWith(U, PAGE, body)
  })

  it('המנהל כבר אישר — 409', async () => {
    db.savePage.mockResolvedValue({ ok: false, status: 409, error: 'המנהל כבר אישר את העמוד' })
    expect((await pagePUT(req({ status: 'draft', frames: [] }), params({ id: PAGE }))).status).toBe(409)
  })
})

describe('תמונת-העמוד', () => {
  it('לא אצלך — 403', async () => {
    db.pageImagePath.mockResolvedValue({ ok: false, status: 403, error: 'הספר לא אצלך' })
    const r = await imageGET(req(null, `http://x/api/training-proof/frames/pages/${PAGE}/image`), params({ id: PAGE }))
    expect(r.status).toBe(403)
    expect(readImage).not.toHaveBeenCalled()
  })

  it('אצלך — התמונה עצמה', async () => {
    db.pageImagePath.mockResolvedValue({ ok: true, imagePath: '/uploads/training-proof/tp-20261027-1f3a9c2e/img/p79.jpg' })
    readImage.mockResolvedValue({ buffer: Buffer.from([1, 2, 3]), mimeType: 'image/jpeg' })
    const r = await imageGET(req(null, `http://x/api/training-proof/frames/pages/${PAGE}/image`), params({ id: PAGE }))
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('image/jpeg')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('תמונה שחסרה בדיסק — 404', async () => {
    db.pageImagePath.mockResolvedValue({ ok: true, imagePath: '/uploads/x.jpg' })
    readImage.mockRejectedValue(Object.assign(new Error('nope'), { code: 'ENOENT' }))
    const r = await imageGET(req(null, `http://x/api/img`), params({ id: PAGE }))
    expect(r.status).toBe(404)
  })
})
