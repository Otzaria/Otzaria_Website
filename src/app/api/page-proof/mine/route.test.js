import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// GET /api/page-proof/mine — מה שדף המתנדב טוען בכניסה: "העמודים שלי" (וגם העמודים
// שהמתנדב שלח לזיהוי-מחדש ועוד לא חזרו), ועם ?page= — הרצף של העמוד הזה או למה הוא
// אינו נפתח. קריאה בלבד: שום פונקציה שתופסת/מחדשת/משחררת אינה נקראת. claims.js,
// pool.js, recutRequests.js ו-pendingSubmissions.js מדומים (ההגשות שממתינות לבדיקת מנהל —
// מול מסד אמיתי ב-submitted.test.js).

const { session, stats, held, seqOf, brief, pending, submitted, writes } = vi.hoisted(() => ({
  session: vi.fn(),
  submitted: vi.fn(),
  stats: vi.fn(),
  held: vi.fn(),
  seqOf: vi.fn(),
  brief: vi.fn(),
  pending: vi.fn(),
  writes: { claimPage: vi.fn(), claimSequence: vi.fn(), renewLease: vi.fn(), releasePage: vi.fn(), releaseLeases: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/pageProof/pool', () => ({
  requireProofSession: session,
  volunteerStats: stats,
  releaseLeases: writes.releaseLeases,
}))
vi.mock('@/lib/pageProof/recutRequests', () => ({ recutPendingOf: pending }))
vi.mock('@/lib/pageProof/pendingSubmissions', () => ({ pendingSubmissionsOf: submitted }))
// מתג המנהל ל"שלח לזיהוי-מחדש" (runtime.js) — כאן פתוח
const recutStatus = vi.hoisted(() => vi.fn())
vi.mock('@/lib/pageProof/runtime', () => ({ recutStatus }))
vi.mock('@/lib/pageProof/claims', () => ({
  heldSequences: held,
  sequenceOfPage: seqOf,
  pageBrief: brief,
  claimPage: writes.claimPage,
  claimSequence: writes.claimSequence,
  renewLease: writes.renewLease,
  releasePage: writes.releasePage,
}))

import { GET } from './route'

const USER_ID = '64b7f0c2a1b2c3d4e5f60003'
const PAGE_ID = '64b7f0c2a1b2c3d4e5f60002'
const req = (qs = '') => ({ url: `http://x/api/page-proof/mine${qs}` })
const SEQ = { book: { id: 'b1', gid: 'g1', title: 'ספר' }, seq: 0, pages: [{ id: PAGE_ID, page: 3, state: 'mine' }] }
const STATS = { open: 10, done: 2, mySubmitted: 1, myApproved: 0, myRejected: 0 }
const PENDING = [{ id: '64b7f0c2a1b2c3d4e5f60009', gid: 'g1', title: 'ספר', page: 7, requestedAt: '2026-09-30T10:00:00.000Z', picked: false }]

beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ userId: USER_ID })
  stats.mockResolvedValue(STATS)
  held.mockResolvedValue([SEQ])
  seqOf.mockResolvedValue(null)
  brief.mockResolvedValue(null)
  pending.mockResolvedValue([])
  submitted.mockResolvedValue([])
  recutStatus.mockResolvedValue({ effective: true, settings: { recutRequests: 'on', autoMinutes: 15 }, seenAt: null })
})

const noWrites = () => {
  for (const fn of Object.values(writes)) expect(fn).not.toHaveBeenCalled()
}

describe('GET /api/page-proof/mine', () => {
  it('בלי התחברות ← 401 (בלי מטמון), ושום דבר לא נקרא', async () => {
    session.mockResolvedValueOnce({ error: NextResponse.json({ success: false, error: 'יש להתחבר' }, { status: 401 }) })
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(held).not.toHaveBeenCalled()
  })

  it('בלי ?page= ← "העמודים שלי" והסטטיסטיקה; שום עמוד אינו נתפס', async () => {
    const res = await GET(req())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, held: [SEQ], recutPending: [], submitted: [], sequence: null, unavailable: null, stats: STATS, recutRequests: true })
    expect(held).toHaveBeenCalledWith(USER_ID, expect.any(Date))
    expect(pending).toHaveBeenCalledWith(USER_ID)
    expect(seqOf).not.toHaveBeenCalled()
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    noWrites()
  })

  it('הגשות שממתינות לבדיקת מנהל ← submitted (קריאה בלבד)', async () => {
    const SUBMITTED = [{ id: PAGE_ID, submissionId: 's1', gid: 'g1', title: 'ספר', page: 3, submittedAt: '2026-10-01T09:00:00.000Z', revision: 1 }]
    submitted.mockResolvedValue(SUBMITTED)
    const body = await (await GET(req())).json()
    expect(body.submitted).toEqual(SUBMITTED)
    expect(submitted).toHaveBeenCalledWith(USER_ID)
    noWrites()
  })

  it('עמודים שנשלחו לזיהוי-מחדש ועוד לא חזרו ← recutPending (קריאה בלבד)', async () => {
    pending.mockResolvedValue(PENDING)
    const body = await (await GET(req())).json()
    expect(body.recutPending).toEqual(PENDING)
    noWrites()
  })

  it('?page= של עמוד שבטיפולי ← הרצף שלו', async () => {
    seqOf.mockResolvedValue(SEQ)
    const body = await (await GET(req(`?page=${PAGE_ID}`))).json()
    expect(body.sequence).toEqual(SEQ)
    expect(body.unavailable).toBeNull()
    expect(seqOf).toHaveBeenCalledWith(PAGE_ID, USER_ID, expect.any(Date))
    expect(brief).not.toHaveBeenCalled()
    noWrites()
  })

  it('?page= של עמוד שאינו בטיפולי ← sequence:null ולמה (המצב שלו), בלי לתפוס אותו או רצף אחר', async () => {
    brief.mockResolvedValue({ id: PAGE_ID, gid: 'g1', page: 3, state: 'taken' })
    const body = await (await GET(req(`?page=${PAGE_ID}`))).json()
    expect(body.sequence).toBeNull()
    expect(body.unavailable).toEqual({ id: PAGE_ID, gid: 'g1', page: 3, state: 'taken' })
    noWrites()
  })

  it('עמוד שאינו קיים ← {id}; מזהה לא תקין ← {id:null} בלי שאילתה', async () => {
    const gone = await (await GET(req(`?page=${PAGE_ID}`))).json()
    expect(gone.unavailable).toEqual({ id: PAGE_ID })
    vi.clearAllMocks()
    session.mockResolvedValue({ userId: USER_ID })
    held.mockResolvedValue([])
    stats.mockResolvedValue(STATS)
    pending.mockResolvedValue([])
    submitted.mockResolvedValue([])
    const bad = await (await GET(req('?page=../../etc'))).json()
    expect(bad.unavailable).toEqual({ id: null })
    expect(seqOf).not.toHaveBeenCalled()
    expect(brief).not.toHaveBeenCalled()
    noWrites()
  })

  it('המנהל כיבה את "שלח לזיהוי-מחדש" (או "אוטומטי" בלי תוכנת-הספר) ← recutRequests: false', async () => {
    recutStatus.mockResolvedValueOnce({ effective: false, settings: { recutRequests: 'auto', autoMinutes: 15 }, seenAt: null })
    const body = await (await GET(req())).json()
    expect(body.recutRequests).toBe(false)
  })

  it('תקלה ← 500 בלי מטמון', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    held.mockRejectedValueOnce(new Error('db down'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
