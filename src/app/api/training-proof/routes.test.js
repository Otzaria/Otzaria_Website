import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// נתיבי /api/training-proof של זיהוי-הטקסט והנתב: השער (403 עם access), דף הבית, בקשת-גישה,
// הסבב, הדופק, השחרור, הסימון, התמונות וההוראות. השער, הסבב והמודלים מדומים — הלוגיקה
// שלהם נבדקת מול Mongo אמיתי ב-lib/trainingProof/round.int.test.mjs.

const m = vi.hoisted(() => ({
  gate: vi.fn(),
  currentRound: vi.fn(),
  takeRound: vi.fn(),
  heartbeat: vi.fn(),
  releaseRound: vi.fn(),
  markItem: vi.fn(),
  volunteerStats: vi.fn(),
  poolCount: vi.fn(),
  roundBrief: vi.fn(),
  framesBrief: vi.fn(),
  volUpdate: vi.fn(),
  guideFind: vi.fn(),
  itemFind: vi.fn(),
  readImage: vi.fn(),
}))

vi.mock('@/lib/trainingProof/access', () => ({ requireTrainingProofSession: m.gate }))
vi.mock('@/lib/trainingProof/round', () => ({
  currentRound: m.currentRound,
  takeRound: m.takeRound,
  heartbeat: m.heartbeat,
  releaseRound: m.releaseRound,
  markItem: m.markItem,
}))
vi.mock('@/lib/trainingProof/stats', () => ({ volunteerStats: m.volunteerStats }))
vi.mock('@/lib/trainingProof/home', () => ({ poolCount: m.poolCount, roundBrief: m.roundBrief, framesBrief: m.framesBrief }))
vi.mock('@/models/TrainingProofVolunteer', () => ({ default: { updateOne: m.volUpdate } }))
vi.mock('@/models/TrainingProofGuide', () => ({ default: { findOne: (...a) => ({ lean: () => m.guideFind(...a) }) } }))
vi.mock('@/models/TrainingProofItem', () => ({ default: { findById: (...a) => ({ lean: () => m.itemFind(...a) }) } }))
vi.mock('@/lib/ocr/images', () => ({ readPageImage: m.readImage }))

import { GET as homeGET } from './route'
import { POST as requestPOST } from './access-request/route'
import { GET as roundGET, POST as roundPOST } from './round/route'
import { POST as beatPOST } from './round/heartbeat/route'
import { POST as releasePOST } from './round/release/route'
import { POST as markPOST } from './items/[id]/mark/route'
import { GET as imageGET } from './items/[id]/image/route'
import { GET as ctxGET } from './items/[id]/ctx/route'
import { GET as guideGET } from './guide/[section]/route'

const USER = '64b7f0c2a1b2c3d4e5f60003'
const ITEM = '64b7f0c2a1b2c3d4e5f60009'
const post = (body, url = 'http://x/api') => ({ url, headers: new Headers(), text: async () => (body === undefined ? '' : JSON.stringify(body)) })
const get = (url = 'http://x/api') => ({ url })
const params = (p) => ({ params: Promise.resolve(p) })
const denied = (access = 'none') =>
  m.gate.mockImplementation(async () => ({
    error: NextResponse.json({ success: false, error: 'אין לך הרשאת גישה לדף זה', access }, { status: 403 }),
  }))
const allowed = (extra = {}) => m.gate.mockResolvedValue({ userId: USER, access: 'approved', isAdmin: false, volunteer: { status: 'approved' }, ...extra })

const doc = (extra = {}) => ({
  _id: ITEM,
  section: 'ocr',
  status: 'held',
  payload: { uid: 'ocr:lines:1', w: 600, h: 40, track: 'rashi', source: 'ocr', text: 'אמר רבי', conf: 91, book: 'b-0123456789', alias: 'ספר 4' },
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  allowed()
})

describe('GET /api/training-proof — דף הבית', () => {
  it('בלי גישה: 200 עם access ו-canRequest, בלי מספרים', async () => {
    m.gate.mockResolvedValue({ userId: USER, access: 'none', isAdmin: false, volunteer: null })
    const body = await (await homeGET()).json()
    expect(body).toMatchObject({ access: 'none', canRequest: true, request: null })
    expect(body.sections).toBeUndefined()
    expect(m.volunteerStats).not.toHaveBeenCalled()
    expect(m.gate).toHaveBeenCalledWith({ anyone: true })
  })

  it('בקשה ממתינה — אין "בקשת גישה" שוב', async () => {
    m.gate.mockResolvedValue({ userId: USER, access: 'pending', isAdmin: false, volunteer: { status: 'pending', requestedAt: new Date() } })
    const body = await (await homeGET()).json()
    expect(body.canRequest).toBe(false)
    expect(body.request.status).toBe('pending')
  })

  it('עם גישה: שלושת החלקים ו"ההגהות שלי"', async () => {
    m.poolCount.mockResolvedValue(120)
    m.roundBrief.mockResolvedValue({ total: 30, open: 4, done: false })
    m.framesBrief.mockResolvedValue({ available: 9, partial: 2, mine: 0 })
    m.volunteerStats.mockResolvedValue({ ocr: { saved: 3 } })
    const res = await homeGET()
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.sections.ocr).toEqual({ pool: 120, round: { total: 30, open: 4, done: false } })
    expect(body.sections.frames.available).toBe(9)
    expect(body.stats.ocr.saved).toBe(3)
  })
})

describe('POST /api/training-proof/access-request', () => {
  it('שומר בקשה pending עם ההודעה', async () => {
    m.gate.mockResolvedValue({ userId: USER, access: 'none' })
    const res = await requestPOST(post({ message: '  מגיה ותיק  ' }))
    expect(res.status).toBe(200)
    expect((await res.json()).access).toBe('pending')
    const upsert = m.volUpdate.mock.calls.find((c) => c[2]?.upsert)
    expect(upsert[1].$setOnInsert).toMatchObject({ userId: USER, status: 'pending', requestMessage: 'מגיה ותיק' })
  })

  it('כבר ממתין / כבר מאושר — 409 בלי כתיבה', async () => {
    m.gate.mockResolvedValue({ userId: USER, access: 'pending' })
    expect((await requestPOST(post({}))).status).toBe(409)
    m.gate.mockResolvedValue({ userId: USER, access: 'approved' })
    expect((await requestPOST(post({}))).status).toBe(409)
    expect(m.volUpdate).not.toHaveBeenCalled()
  })
})

describe('הסבב', () => {
  it('בלי גישה — 403 עם access, בכל הנתיבים', async () => {
    denied('pending')
    for (const res of [
      await roundGET(get('http://x/api/training-proof/round?section=ocr')),
      await roundPOST(post({ section: 'ocr' })),
      await beatPOST(post({ section: 'ocr' })),
      await releasePOST(post({ section: 'ocr' })),
      await markPOST(post({ action: 'ok' }), params({ id: ITEM })),
      await imageGET(get(), params({ id: ITEM })),
      await guideGET(get(), params({ section: 'ocr' })),
    ]) {
      expect(res.status).toBe(403)
      expect((await res.json()).access).toBe('pending')
    }
    expect(m.takeRound).not.toHaveBeenCalled()
    expect(m.markItem).not.toHaveBeenCalled()
  })

  it('GET — הסבב הנוכחי, בלי book ובלי conf', async () => {
    m.currentRound.mockResolvedValue({ round: 'r1', items: [doc()], open: 1, done: false })
    const body = await (await roundGET(get('http://x/api/training-proof/round?section=ocr'))).json()
    expect(body.round).toBe('r1')
    expect(body.items[0]).toMatchObject({ id: ITEM, track: 'rashi', alias: 'ספר 4', img: `/api/training-proof/items/${ITEM}/image` })
    expect(JSON.stringify(body)).not.toMatch(/b-0123456789|"conf"/)
  })

  it('חלק לא מוכר (גם frames — יש לו נתיבים משלו) — 400', async () => {
    expect((await roundGET(get('http://x/api/training-proof/round?section=frames'))).status).toBe(400)
    expect((await roundPOST(post({ section: 'x' }))).status).toBe(400)
    expect((await beatPOST(post({}))).status).toBe(400)
  })

  it('POST — סבב חדש או הקיים (resumed)', async () => {
    m.takeRound.mockResolvedValue({ ok: true, resumed: true, round: 'r1', items: [doc()], open: 1, done: false })
    const body = await (await roundPOST(post({ section: 'router' }))).json()
    expect(m.takeRound).toHaveBeenCalledWith(USER, 'router')
    expect(body.resumed).toBe(true)
  })

  it('דופק ושחרור — גם בגוף text/plain של sendBeacon', async () => {
    m.heartbeat.mockResolvedValue(12)
    expect((await (await beatPOST(post({ section: 'ocr' }))).json()).open).toBe(12)
    m.releaseRound.mockResolvedValue(7)
    expect((await (await releasePOST(post({ section: 'router' }))).json()).released).toBe(7)
    expect(m.releaseRound).toHaveBeenCalledWith(USER, 'router')
  })
})

describe('POST /api/training-proof/items/[id]/mark', () => {
  it('סימון נשמר ומוחזר בצורה הציבורית', async () => {
    m.markItem.mockResolvedValue({ ok: true, item: doc({ status: 'submitted', result: { action: 'fixed', text: 'אמר רבי יצחק' } }) })
    const body = await (await markPOST(post({ action: 'fixed', text: 'אמר רבי יצחק' }), params({ id: ITEM }))).json()
    expect(m.markItem).toHaveBeenCalledWith(USER, ITEM, { action: 'fixed', text: 'אמר רבי יצחק' })
    expect(body.item.result.text).toBe('אמר רבי יצחק')
  })

  it('לא בסבב / סימון לא תקין — הסטטוס מהסבב', async () => {
    m.markItem.mockResolvedValue({ ok: false, status: 409, error: 'השורה כבר לא אצלך' })
    const res = await markPOST(post({ action: 'ok' }), params({ id: ITEM }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/לא אצלך/)
  })
})

describe('התמונות', () => {
  it('רק למי שהשורה בסבב שלו', async () => {
    m.itemFind.mockResolvedValue({ imagePath: '/uploads/training-proof/x/img/1.png', heldBy: 'someone-else' })
    expect((await imageGET(get(), params({ id: ITEM }))).status).toBe(403)
    expect(m.readImage).not.toHaveBeenCalled()
  })

  it('השורה שלו — התמונה, פרטית', async () => {
    m.itemFind.mockResolvedValue({ imagePath: '/uploads/training-proof/x/img/1.png', heldBy: USER })
    m.readImage.mockResolvedValue({ buffer: Buffer.from('png'), mimeType: 'image/png' })
    const res = await imageGET(get(), params({ id: ITEM }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toMatch(/^private/)
  })

  it('מנהל רואה כל תמונה; בלי עמוד מלא — 404', async () => {
    allowed({ isAdmin: true, access: 'admin' })
    m.itemFind.mockResolvedValue({ ctxPath: null, heldBy: null })
    expect((await ctxGET(get(), params({ id: ITEM }))).status).toBe(404)
    expect((await imageGET(get(), params({ id: 'bad' }))).status).toBe(400)
  })
})

describe('GET /api/training-proof/guide/[section]', () => {
  it('ההוראות שבעל הפרויקט כתב; בלי — ריק', async () => {
    m.guideFind.mockResolvedValue({ markdown: '## כללים', updatedAt: new Date('2026-10-24') })
    expect((await (await guideGET(get(), params({ section: 'router' }))).json()).markdown).toBe('## כללים')
    m.guideFind.mockResolvedValue(null)
    expect((await (await guideGET(get(), params({ section: 'frames' }))).json()).markdown).toBe('')
    expect((await guideGET(get(), params({ section: 'x' }))).status).toBe(400)
  })
})
