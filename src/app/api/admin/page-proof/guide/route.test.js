// @vitest-environment node
// מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — הבדיקות מדולגות.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'

// דף ההנחיות להגהת עמודים — עריכה מדף הניהול (בעל הפרויקט, 2026-10-06): קריאה, תצוגה מקדימה בלי שמירה, שמירה מנוקה
// שמבטלת את המטמון של הדף, וחזרה לנוסח המקורי. רק מנהל OCR.

const { getServerSessionMock, revalidateTagMock } = vi.hoisted(() => ({ getServerSessionMock: vi.fn(), revalidateTagMock: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: getServerSessionMock }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('next/cache', () => ({ unstable_cache: (fn) => fn, revalidateTag: revalidateTagMock }))

import User from '@/models/User'
import SystemConfig from '@/models/SystemConfig'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { CACHE_TAGS } from '@/lib/cacheTags'
import { DEFAULT_GUIDE_HTML, GUIDE_KEY } from '@/lib/pageProof/guideContent'
import { loadGuide } from '@/lib/pageProof/guideStore'
import { DELETE, GET, PUT } from './route'

vi.setConfig({ testTimeout: 30000 })

let db
beforeAll(async () => {
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
})

let admin
let vol
const as = (u) => getServerSessionMock.mockResolvedValue({ user: { id: String(u._id), _id: String(u._id), name: u.name, role: u.role || 'user', isVerified: true } })
const req = (method, body) =>
  new Request('http://localhost/api/admin/page-proof/guide', { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
const HTML = '<section id="a"><h2>פרק</h2><p>[[כפתור:finish]]<script>x()</script></p></section>'

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  admin = await User.create({ name: 'מנהלת', email: 'm@example.org', password: 'x', role: 'admin_ocr' })
  vol = await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isVerified: true })
  as(admin)
})

describe('דף ההנחיות — עריכה מדף הניהול', () => {
  it('בהתחלה — אין נוסח שמור: הנוסח המקורי והקודים', async () => {
    const d = await (await GET(req('GET'))).json()
    expect(d).toMatchObject({ success: true, saved: null, default: DEFAULT_GUIDE_HTML })
    expect(d.codes.figures).toContain('[[איור:ריהוט]]')
    expect(await loadGuide()).toBe(null)
  })

  it('תצוגה מקדימה — מנוקה, עם הקודים מוחלפים, ובלי לשמור', async () => {
    const d = await (await PUT(req('PUT', { html: HTML, preview: true }))).json()
    expect(d.success).toBe(true)
    expect(d.preview.html).not.toMatch(/script/)
    expect(d.preview.toc).toEqual([{ href: '#a', label: 'פרק' }])
    expect(await SystemConfig.countDocuments({ key: GUIDE_KEY })).toBe(0)
    expect(revalidateTagMock).not.toHaveBeenCalled()
  })

  it('שמירה — מנוקה, עם שם השומר, והמטמון של הדף מתבטל; DELETE מחזיר לנוסח המקורי', async () => {
    const d = await (await PUT(req('PUT', { html: HTML }))).json()
    expect(d.success).toBe(true)
    expect(d.html).toBe('<section id="a"><h2>פרק</h2><p>[[כפתור:finish]]</p></section>')
    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.PAGE_PROOF_GUIDE, { expire: 0 })
    const g = await loadGuide()
    expect(g).toMatchObject({ html: d.html, byName: 'מנהלת' })
    expect((await (await GET(req('GET'))).json()).saved.html).toBe(d.html)
    expect((await DELETE(req('DELETE'))).status).toBe(200)
    expect(await loadGuide()).toBe(null)
  })

  it('קלט לא תקין ← 400 בעברית; מתנדב ← 403 ושום דבר לא נשמר', async () => {
    let res = await PUT(req('PUT', { html: '<p>בלי כותרת</p>' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/כותרת-פרק/)
    as(vol)
    for (const r of [await GET(req('GET')), await PUT(req('PUT', { html: HTML })), await DELETE(req('DELETE'))]) expect(r.status).toBe(403)
    expect(await SystemConfig.countDocuments({ key: GUIDE_KEY })).toBe(0)
  })
})
