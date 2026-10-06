import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useServerDraft } from './useServerDraft'
import { DRAFT_IDLE_MS, DRAFT_RETRY_MS, DRAFT_SAVE_MS, KEEPALIVE_MAX, baseKeysOf, readDraftMeta } from '@/lib/pageProof/draftRules'

// שמירת הטיוטה בשרת מדף המתנדב (docs/63 §2): אחרי השהיה, לכל היותר פעם בכ-5 שניות, בלי לשלוח מה שכבר שם;
// השלב — מיד; 403/409 — מפסיקים; כשל-רשת — "לא נשמר בשרת" ושוב אחרי DRAFT_RETRY_MS; סגירה — keepalive.

const PID = '64b7f0c2a1b2c3d4e5f60718'
const KEY = `page-proof-draft:${PID}:1:abcd`
const TEXT = { kind: 'text', page: 4, ids: [1], value: 'שורה מתוקנת', _g: 'g1', _s: 's1' }
const OK = { kind: 'line_ok', page: 4, ids: [2], _s: 's2' }

let puts
let reply

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  puts = []
  reply = () => ({ ok: true, status: 200, json: async () => ({ success: true, updatedAt: `2026-10-05T10:00:0${puts.length}.000Z` }) })
  global.fetch = vi.fn(async (url, init) => {
    puts.push({ url, init, body: JSON.parse(init.body) })
    return reply()
  })
})
afterEach(() => {
  vi.useRealTimers()
})

const mount = (opts = {}) =>
  renderHook((p) => useServerDraft(p), { initialProps: { pageId: PID, revision: 1, draftKey: KEY, stage: 'structure', initial: null, ...opts } })
const tick = async (ms) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useServerDraft', () => {
  it('הרינדור הראשון עם מה שכבר בשרת — לא נשלח; שינוי — נשלח אחרי השהיה, בלי שדות-הפנים של העורך', async () => {
    const { result } = mount({ initial: { ops: [TEXT], srv: '2026-10-05T09:00:00.000Z' } })
    expect(result.current.status.state).toBe('saved')
    act(() => result.current.onOps([TEXT]))
    await tick(DRAFT_SAVE_MS * 2)
    expect(puts).toHaveLength(0)

    act(() => result.current.onOps([TEXT, OK]))
    expect(result.current.status.state).toBe('pending')
    await tick(DRAFT_IDLE_MS - 100)
    expect(puts).toHaveLength(0)
    await tick(200)
    expect(puts).toHaveLength(1)
    expect(puts[0].url).toBe(`/api/page-proof/pages/${PID}/draft`)
    expect(puts[0].init.method).toBe('PUT')
    expect(puts[0].body).toEqual({
      revision: 1,
      stage: 'structure',
      baseUpdatedAt: '2026-10-05T09:00:00.000Z',
      ops: [
        { kind: 'text', page: 4, ids: [1], value: 'שורה מתוקנת' },
        { kind: 'line_ok', page: 4, ids: [2] },
      ],
    })
    expect(result.current.status).toMatchObject({ state: 'saved', at: '2026-10-05T10:00:01.000Z' })
    // base — טביעות הגרסה שנשמרה עכשיו: הבסיס למיזוג המשולש בפתיחה הבאה
    expect(readDraftMeta(window.localStorage, PID)).toEqual({
      key: KEY,
      srv: '2026-10-05T10:00:01.000Z',
      stage: 'structure',
      stale: false,
      base: baseKeysOf([TEXT, OK]),
    })
  })

  it('לכל היותר שמירה אחת לכל DRAFT_SAVE_MS, גם בהקלדה רצופה', async () => {
    const { result } = mount()
    act(() => result.current.onOps([TEXT]))
    await tick(DRAFT_IDLE_MS + 10)
    expect(puts).toHaveLength(1)
    act(() => result.current.onOps([TEXT, OK]))
    await tick(DRAFT_IDLE_MS + 10)
    expect(puts).toHaveLength(1)
    await tick(DRAFT_SAVE_MS)
    expect(puts).toHaveLength(2)
  })

  it('השלב נשמר מיד', async () => {
    const { result } = mount()
    act(() => result.current.onOps([TEXT]))
    await act(async () => {
      await result.current.setStage('text')
    })
    expect(puts).toHaveLength(1)
    expect(puts[0].body.stage).toBe('text')
  })

  it('403 (העמוד כבר אינו בטיפולכם) ← "לא נשמר בשרת" ולא מנסים שוב; 409 ← "טענו מחדש"', async () => {
    reply = () => ({ ok: false, status: 403, json: async () => ({ success: false, error: 'אינו בטיפולכם', code: 'not_holder' }) })
    const { result } = mount()
    act(() => result.current.onOps([TEXT]))
    await tick(DRAFT_IDLE_MS + 10)
    expect(result.current.status).toMatchObject({ state: 'lost', error: 'אינו בטיפולכם' })
    act(() => result.current.onOps([TEXT, OK]))
    await tick(DRAFT_RETRY_MS * 2)
    expect(puts).toHaveLength(1)

    reply = () => ({ ok: false, status: 409, json: async () => ({ success: false, error: 'הוחלף', code: 'reload' }) })
    const other = mount()
    act(() => other.result.current.onOps([TEXT]))
    await tick(DRAFT_IDLE_MS + 10)
    expect(other.result.current.status.state).toBe('reload')
  })

  it('אין רשת ← "לא נשמר בשרת", ושוב אחרי DRAFT_RETRY_MS', async () => {
    let fail = true
    global.fetch = vi.fn(async (url, init) => {
      puts.push({ url, init, body: JSON.parse(init.body) })
      if (fail) throw new TypeError('Failed to fetch')
      return reply()
    })
    const { result } = mount()
    act(() => result.current.onOps([TEXT]))
    await tick(DRAFT_IDLE_MS + 10)
    expect(result.current.status).toMatchObject({ state: 'error', error: 'אין חיבור לאתר' })
    fail = false
    await tick(DRAFT_RETRY_MS + 10)
    expect(puts).toHaveLength(2)
    expect(result.current.status.state).toBe('saved')
  })

  it('סגירת העורך עם שינוי שעוד לא נשלח — שמירה אחרונה ב-keepalive; reset — "התחל מאפס"', async () => {
    const { result, unmount } = mount()
    act(() => result.current.onOps([TEXT]))
    unmount()
    await tick(0)
    expect(puts).toHaveLength(1)
    expect(puts[0].init.keepalive).toBe(true)

    const second = mount()
    await act(async () => {
      await second.result.current.reset()
    })
    expect(puts[1].body).toEqual({ revision: 1, ops: [], stage: 'structure', reset: true, baseUpdatedAt: null })
  })

  it('baseUpdatedAt: הבסיס הוא מה שהשרת החזיר בשמירה הקודמת; 409 stale ← "טענו מחדש" ולא שומרים עוד', async () => {
    const { result } = mount()
    act(() => result.current.onOps([TEXT]))
    await tick(DRAFT_IDLE_MS + 10)
    expect(puts[0].body.baseUpdatedAt).toBeNull()
    await act(async () => {
      await result.current.setStage('text')
    })
    expect(puts[1].body.baseUpdatedAt).toBe('2026-10-05T10:00:01.000Z')
    reply = () => ({ ok: false, status: 409, json: async () => ({ success: false, error: 'נשמרה בינתיים', code: 'stale' }) })
    act(() => result.current.onOps([TEXT, OK]))
    await tick(DRAFT_SAVE_MS + 10)
    expect(result.current.status).toMatchObject({ state: 'stale', error: 'נשמרה בינתיים' })
    // בפתיחה הבאה — לא לבחור לפי שעון (draftRules.applyServerDraft)
    expect(readDraftMeta(window.localStorage, PID)).toMatchObject({ key: KEY, stale: true })
    act(() => result.current.onOps([OK]))
    await tick(DRAFT_RETRY_MS * 2)
    expect(puts).toHaveLength(3)
  })

  it('תור: שמירה בזמן שבקשה בדרך יוצאת אחריה, עם התוכן העדכני — וההבטחה מתקיימת רק אחרי שנשמר (לפני זיהוי-מחדש)', async () => {
    let release
    const gate = new Promise((r) => (release = r))
    global.fetch = vi.fn(async (url, init) => {
      puts.push({ url, init, body: JSON.parse(init.body) })
      if (puts.length === 1) await gate
      return reply()
    })
    const { result } = mount()
    act(() => result.current.onOps([TEXT]))
    await tick(DRAFT_IDLE_MS + 10)
    expect(puts).toHaveLength(1)
    act(() => result.current.onOps([TEXT, OK]))
    let done = false
    let p
    act(() => {
      p = result.current.setStage('text').then((v) => ((done = true), v))
    })
    await tick(0)
    expect([puts.length, done]).toEqual([1, false])
    release()
    await act(async () => {
      expect(await p).toBe(true)
    })
    expect(puts).toHaveLength(2)
    expect(puts[1].body).toMatchObject({ stage: 'text', ops: [{ kind: 'text' }, { kind: 'line_ok' }] })
  })

  it('"התחל מאפס" בזמן שבקשה בדרך — בקשה משלה אחריה (לא נבלע); סגירה לפני שאושר — שמירת-היציאה מאפסת', async () => {
    let release
    const gate = new Promise((r) => (release = r))
    global.fetch = vi.fn(async (url, init) => {
      puts.push({ url, init, body: JSON.parse(init.body) })
      if (puts.length === 1) await gate
      return reply()
    })
    const { result } = mount()
    act(() => result.current.onOps([TEXT]))
    await tick(DRAFT_IDLE_MS + 10)
    let p
    act(() => {
      p = result.current.reset()
    })
    release()
    await act(async () => {
      await p
    })
    expect(puts.map((x) => x.body.reset === true)).toEqual([false, true])

    // סגירה לפני שה"התחל מאפס" אושר בשרת
    reply = () => ({ ok: false, status: 500, json: async () => ({ success: false }) })
    const other = mount()
    await act(async () => {
      await other.result.current.reset()
    })
    reply = () => ({ ok: true, status: 200, json: async () => ({ success: true, updatedAt: '2026-10-05T11:00:00.000Z' }) })
    act(() => other.result.current.onOps([TEXT]))
    other.unmount()
    await tick(0)
    const last = puts[puts.length - 1]
    expect(last.init.keepalive).toBe(true)
    expect(last.body).toMatchObject({ reset: true, ops: [] })
  })

  it('שמירת-היציאה: keepalive רק לגוף קטן מ-KEEPALIVE_MAX (דפדפנים דוחים יותר) — גדול יותר יוצא כבקשה רגילה', async () => {
    const big = Array.from({ length: 400 }, (_, i) => ({ kind: 'text', page: 4, ids: [i + 1], value: 'א'.repeat(200) }))
    const { result, unmount } = mount()
    act(() => result.current.onOps(big))
    unmount()
    await tick(0)
    expect(puts).toHaveLength(1)
    expect(puts[0].init.body.length).toBeGreaterThan(KEEPALIVE_MAX)
    expect(puts[0].init.keepalive).toBe(false)
  })

  it('הלשונית מוסתרת — שמירה רגילה בתור (הדף עדיין חי), לא keepalive', async () => {
    const { result } = mount()
    act(() => result.current.onOps([TEXT]))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    try {
      act(() => document.dispatchEvent(new Event('visibilitychange')))
      await tick(0)
    } finally {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    }
    expect(puts).toHaveLength(1)
    expect(puts[0].init.keepalive).toBe(false)
  })
})
