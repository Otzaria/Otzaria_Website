import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pollUpload, uploadFile } from './chunkedUpload'
import { RESUME_STORE, rememberResume, resumeKey } from './uploadPlan'

// מנוע ההעלאה מול שרת מדומה: חלוקה ל-PUT לכל חלק (Blob.slice), ניסיונות חוזרים, "ממשיכים הלאה"
// כשחלק נכשל, המשך העלאה שמדלג על חלקים שכבר בשרת, סיום (202) ומעקב עד done.

const API = '/api/admin/tzurat-hadaf'
const zip = (size = 25, name = 'berakhot.zip') => new File([new Uint8Array(size).fill(7)], name, { type: 'application/zip', lastModified: 1234 })

const memStorage = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), raw: m }
}

// failures: {n: מספר הכישלונות לפני הצלחה | 'net' (תמיד שגיאת רשת)}; existing: העלאה קיימת לפי מזהה
function server({ chunkSize = 10, failures = {}, existing = {}, statuses = [] } = {}) {
  const uploads = { ...existing }
  const puts = []
  const tries = {}
  let seq = 0
  const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
  const fetchFn = vi.fn(async (url, init = {}) => {
    const method = init.method || 'GET'
    if (url === `${API}/uploads` && method === 'POST') {
      const b = JSON.parse(init.body)
      const id = `u${++seq}`
      uploads[id] = { id, name: b.name, size: b.size, chunkSize, chunks: Math.ceil(b.size / chunkSize), received: [], status: 'uploading' }
      return reply(200, { id, chunkSize, chunks: uploads[id].chunks })
    }
    let m = url.match(/\/uploads\/(\w+)\/chunks\/(\d+)$/)
    if (m && method === 'PUT') {
      const n = Number(m[2])
      tries[n] = (tries[n] || 0) + 1
      const f = failures[n]
      if (f === 'net') throw new TypeError('Failed to fetch')
      if (typeof f === 'number' && tries[n] <= f) return reply(503, { error: 'עומס' })
      if (f === 'fatal') return reply(413, { error: 'החלק גדול מדי' })
      if (f === 'login') return { ok: false, status: 0, type: 'opaqueredirect', json: async () => null }
      expect(init.redirect).toBe('manual')
      puts.push({ n, size: init.body.size, type: init.headers['Content-Type'] })
      const u = uploads[m[1]]
      if (!u.received.includes(n)) u.received.push(n)
      return reply(200, { received: u.received })
    }
    m = url.match(/\/uploads\/(\w+)\/complete$/)
    if (m && method === 'POST') {
      uploads[m[1]].status = 'queued'
      return reply(202, { upload: { ...uploads[m[1]] } })
    }
    m = url.match(/\/uploads\/(\w+)$/)
    if (m && method === 'GET') {
      const u = uploads[m[1]]
      if (!u) return reply(404, { error: 'לא נמצא' })
      if (statuses.length && u.status !== 'uploading') Object.assign(u, statuses.shift())
      return reply(200, { upload: { ...u } })
    }
    throw new Error(`fetch לא צפוי: ${method} ${url}`)
  })
  return { fetchFn, puts, tries, uploads }
}

const sleep = vi.fn(async () => {})

beforeEach(() => {
  sleep.mockClear()
})

describe('uploadFile', () => {
  it('יוצר העלאה, שולח כל חלק ב-PUT בגודל הנכון, ומסיים ב-202', async () => {
    const s = server()
    const storage = memStorage()
    const progress = []
    const r = await uploadFile(zip(25), { fetchFn: s.fetchFn, sleep, storage, onProgress: (p) => progress.push(p.sent) })
    expect(r.ok).toBe(true)
    expect(r.upload.status).toBe('queued')
    expect(s.puts).toEqual([
      { n: 0, size: 10, type: 'application/octet-stream' },
      { n: 1, size: 10, type: 'application/octet-stream' },
      { n: 2, size: 5, type: 'application/octet-stream' },
    ])
    expect(progress).toEqual([0, 10, 20, 25])
    const create = s.fetchFn.mock.calls.find(([u, i]) => u === `${API}/uploads` && i.method === 'POST')
    expect(JSON.parse(create[1].body)).toEqual({ name: 'berakhot.zip', size: 25 })
    // הסתיים — מפתח ההמשך נמחק
    expect(JSON.parse(storage.raw.get(RESUME_STORE))).toEqual({})
  })

  it('חלק שנכשל זמנית — ניסיון חוזר עם המתנה, ואז הצלחה', async () => {
    const s = server({ failures: { 1: 2 } })
    const r = await uploadFile(zip(25), { fetchFn: s.fetchFn, sleep, storage: memStorage() })
    expect(r.ok).toBe(true)
    expect(s.tries[1]).toBe(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000])
  })

  it('שגיאת רשת קבועה בחלק — ממשיכים לחלקים הבאים, ובלי "סיום"', async () => {
    const s = server({ failures: { 0: 'net' } })
    const storage = memStorage()
    const r = await uploadFile(zip(25), { fetchFn: s.fetchFn, sleep, storage })
    expect(r).toMatchObject({ ok: false, id: 'u1', missing: 1 })
    expect(s.tries[0]).toBe(3)
    expect(s.puts.map((p) => p.n)).toEqual([1, 2])
    expect(s.fetchFn.mock.calls.some(([u]) => u.endsWith('/complete'))).toBe(false)
    // המזהה נשמר להמשך
    expect(JSON.parse(storage.raw.get(RESUME_STORE))[resumeKey(zip(25))].id).toBe('u1')
  })

  it('התחברות שפגה בזמן ההעלאה (הפניה לדף ההתחברות) — עוצרים מיד, עם הודעה בעברית', async () => {
    const s = server({ failures: { 0: 'login' } })
    const r = await uploadFile(zip(25), { fetchFn: s.fetchFn, sleep, storage: memStorage() })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('פג תוקף ההתחברות. התחבר מחדש ונסה שוב.')
    expect(s.tries[0]).toBe(1)
    expect(s.puts).toEqual([])
  })

  it('שגיאה שאין טעם לחזור עליה (413) — עוצרים מיד', async () => {
    const s = server({ failures: { 0: 'fatal' } })
    const r = await uploadFile(zip(25), { fetchFn: s.fetchFn, sleep, storage: memStorage() })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('החלק גדול מדי')
    expect(s.tries[0]).toBe(1)
    expect(s.puts).toEqual([])
  })

  it('המשך העלאה (אחרי רענון): לפי localStorage, רק החלקים שחסרים בשרת', async () => {
    const f = zip(25)
    const s = server({ existing: { old1: { id: 'old1', name: f.name, size: 25, chunkSize: 10, chunks: 3, received: [0, 2], status: 'uploading' } } })
    const storage = memStorage()
    rememberResume(f, 'old1', storage)
    const progress = []
    const r = await uploadFile(f, { fetchFn: s.fetchFn, sleep, storage, resume: true, onProgress: (p) => progress.push(p.sent) })
    expect(r.ok).toBe(true)
    expect(s.puts.map((p) => p.n)).toEqual([1])
    expect(progress[0]).toBe(15)
    expect(s.fetchFn.mock.calls.some(([u, i]) => u === `${API}/uploads` && i.method === 'POST')).toBe(false)
  })

  it('מזהה שמור של קובץ אחר / שנמחק בשרת — העלאה חדשה', async () => {
    const f = zip(25)
    const s = server()
    const storage = memStorage()
    rememberResume(f, 'gone', storage)
    const r = await uploadFile(f, { fetchFn: s.fetchFn, sleep, storage, resume: true })
    expect(r.ok).toBe(true)
    expect(s.puts).toHaveLength(3)
  })

  it('העלאה שכבר הושלמה בעבר — לא שולחים שוב', async () => {
    const f = zip(25)
    const s = server({ existing: { old1: { id: 'old1', name: f.name, size: 25, chunkSize: 10, chunks: 3, received: [0, 1, 2], status: 'processing' } } })
    const r = await uploadFile(f, { fetchFn: s.fetchFn, sleep, storage: memStorage(), resumeId: 'old1' })
    expect(r).toMatchObject({ ok: true, already: true })
    expect(s.puts).toEqual([])
  })

  it('עצירה — אחרי החלק הנוכחי', async () => {
    const s = server()
    let stop = false
    const r = await uploadFile(zip(25), {
      fetchFn: s.fetchFn,
      sleep,
      storage: memStorage(),
      shouldStop: () => stop,
      onProgress: (p) => {
        if (p.sent >= 10) stop = true
      },
    })
    expect(r).toMatchObject({ ok: false, stopped: true, id: 'u1' })
    expect(s.puts.map((p) => p.n)).toEqual([0])
  })
})

describe('pollUpload', () => {
  it('בודק עד done, ומעביר כל מצב', async () => {
    const s = server({
      existing: { j1: { id: 'j1', name: 'a.zip', size: 1, status: 'queued', progress: {} } },
      statuses: [{ status: 'processing', progress: { pages: 10 } }, { status: 'done', summary: { pages: 125 } }],
    })
    const seen = []
    const last = await pollUpload('j1', { fetchFn: s.fetchFn, sleep, every: 5000, onUpdate: (u) => seen.push(u.status) })
    expect(seen).toEqual(['processing', 'done'])
    expect(last.summary).toEqual({ pages: 125 })
    expect(sleep).toHaveBeenCalledWith(5000)
  })
  it('alive() false — מפסיק', async () => {
    const s = server({ existing: { j1: { id: 'j1', status: 'processing' } } })
    const last = await pollUpload('j1', { fetchFn: s.fetchFn, sleep, alive: () => false })
    expect(last).toBeNull()
    expect(s.fetchFn).not.toHaveBeenCalled()
  })
})
