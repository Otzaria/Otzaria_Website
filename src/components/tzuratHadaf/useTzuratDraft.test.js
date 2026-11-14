import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DRAFT_MS, DRAFT_RETRY_MS, createDraftEngine } from './useTzuratDraft'

// מנוע הטיוטה: השמירה יוצאת DRAFT_MS אחרי השינוי הראשון, עם התוכן העדכני וה-baseUpdatedAt; 409 עוצר; שגיאה — שוב.
function setup(results) {
  const statuses = []
  const sent = []
  const save = vi.fn(async (id, body, opts) => {
    sent.push({ id, body, opts })
    return results.shift() || { ok: true, status: 200, data: { updatedAt: `t${sent.length}` } }
  })
  const eng = createDraftEngine({ pageId: 'p1', version: '["b1",1]', baseUpdatedAt: 't0', onStatus: (s) => statuses.push(s.state), save })
  return { eng, sent, statuses, save }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createDraftEngine', () => {
  it('שמירה אחת אחרי DRAFT_MS עם המצב האחרון, והבסיס מתעדכן', async () => {
    const { eng, sent, statuses } = setup([])
    eng.seed('overview', { a: 0 })
    eng.update('overview', { a: 0 })
    expect(statuses).toEqual([])
    eng.update('overview', { a: 1 })
    eng.update('lines', { a: 2 })
    expect(eng.dirty()).toBe(true)
    await vi.advanceTimersByTimeAsync(DRAFT_MS - 1)
    expect(sent).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(sent).toEqual([{ id: 'p1', body: { stage: 'lines', state: { a: 2 }, version: '["b1",1]', baseUpdatedAt: 't0' }, opts: { keepalive: false } }])
    expect(statuses.at(-1)).toBe('saved')
    expect(eng.dirty()).toBe(false)
    eng.update('lines', { a: 3 })
    await vi.advanceTimersByTimeAsync(DRAFT_MS)
    expect(sent[1].body.baseUpdatedAt).toBe('t1')
  })

  it('409 stale — עוצרים ולא שולחים עוד', async () => {
    const { eng, sent, statuses } = setup([{ ok: false, status: 409, code: 'stale', error: 'x', data: {} }])
    eng.update('overview', { a: 1 })
    await vi.advanceTimersByTimeAsync(DRAFT_MS)
    expect(statuses.at(-1)).toBe('stale')
    eng.update('overview', { a: 2 })
    await vi.advanceTimersByTimeAsync(DRAFT_MS * 3)
    expect(sent).toHaveLength(1)
  })

  it('409 not_holder → lost; שגיאת רשת — ניסיון חוזר', async () => {
    const a = setup([{ ok: false, status: 409, code: 'not_holder', data: {} }])
    a.eng.update('overview', { a: 1 })
    await vi.advanceTimersByTimeAsync(DRAFT_MS)
    expect(a.statuses.at(-1)).toBe('lost')

    const b = setup([{ ok: false, status: 0, error: 'אין חיבור', data: {} }])
    b.eng.update('overview', { a: 1 })
    await vi.advanceTimersByTimeAsync(DRAFT_MS)
    expect(b.statuses.at(-1)).toBe('error')
    await vi.advanceTimersByTimeAsync(DRAFT_RETRY_MS)
    expect(b.sent).toHaveLength(2)
    expect(b.statuses.at(-1)).toBe('saved')
  })

  it('יציאה מהדף — keepalive מיד; מושבת — לא שולח', async () => {
    const { eng, sent } = setup([])
    eng.update('text', { a: 1 })
    eng.leave()
    await vi.advanceTimersByTimeAsync(0)
    expect(sent[0].opts).toEqual({ keepalive: true })
    const off = setup([])
    off.eng.setEnabled(false)
    off.eng.update('text', { a: 1 })
    await vi.advanceTimersByTimeAsync(DRAFT_MS * 2)
    expect(off.sent).toHaveLength(0)
  })
})
