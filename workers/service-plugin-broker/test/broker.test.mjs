import assert from 'node:assert/strict'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { Broker, keepSetFrom, pruneDataDir } from '../src/broker.js'
import { HttpError, LeaseLostError, abortReason } from '../src/errors.js'
import { startHeartbeat } from '../src/heartbeat.js'
import { WorkerApi } from '../src/api.js'
import { codeFiles, codeFingerprint } from '../src/codeVersion.js'
import { tempDir } from './helpers.mjs'

const REVIEW_ID = 'c'.repeat(24)
const job = { reviewId: REVIEW_ID, leaseToken: 't', kind: 'plugin', manifestDigest: 'd'.repeat(64), receipts: [], assets: [],
  plugin: { size: 1, sha256: '0'.repeat(64) }, submission: { sources: [{ repository: 'o/r', commit: 'a'.repeat(40) }] } }

const waitFor = (fn, ms = 3000) => new Promise((resolve, reject) => {
  const start = Date.now()
  const t = setInterval(() => {
    if (fn()) {
      clearInterval(t)
      resolve()
    } else if (Date.now() - start > ms) {
      clearInterval(t)
      reject(new Error('timeout'))
    }
  }, 5)
})

test('heartbeat: 409 lease_lost → onLost פעם אחת ועצירה', async () => {
  let calls = 0
  const lost = []
  const hb = startHeartbeat({ api: { heartbeat: async () => { calls++; if (calls === 2) throw new LeaseLostError() } },
    reviewId: REVIEW_ID, leaseToken: 't', onLost: (r) => lost.push(r), intervalMs: 20 })
  await waitFor(() => lost.length === 1)
  await new Promise((r) => setTimeout(r, 80))
  assert.deepEqual(lost, ['lease_lost'])
  assert.equal(calls, 2)
  hb.stop()
})

test('heartbeat: שגיאות רשת רצופות מעבר לסף השתיקה → heartbeat_timeout', async () => {
  const lost = []
  const hb = startHeartbeat({ api: { heartbeat: async () => { throw new HttpError(503, null, { retryable: true }) } },
    reviewId: REVIEW_ID, leaseToken: 't', onLost: (r) => lost.push(r), intervalMs: 20, maxSilenceMs: 100 })
  await waitFor(() => lost.length === 1)
  assert.deepEqual(lost, ['heartbeat_timeout'])
  hb.stop()
})

test('heartbeat: 503 בודד אינו מפסיק את המשימה', async () => {
  let n = 0
  const lost = []
  const hb = startHeartbeat({ api: { heartbeat: async () => { if (++n === 1) throw new HttpError(503, null, { retryable: true }) } },
    reviewId: REVIEW_ID, leaseToken: 't', onLost: (r) => lost.push(r), intervalMs: 15, maxSilenceMs: 1000 })
  await waitFor(() => n >= 4)
  hb.stop()
  assert.deepEqual(lost, [])
})

test('אובדן lease באמצע משימה: הצינור מבוטל, תהליכים נעצרים, ולא נשלחים failure או result', async (t) => {
  const dir = await tempDir(t)
  const sent = []
  const api = {
    heartbeat: async () => { throw new LeaseLostError() },
    failure: async () => sent.push('failure'),
    result: async () => sent.push('result'),
    checkpoint: async () => sent.push('checkpoint'),
  }
  let sawAbort = false
  const stages = {
    hashes: (ctx) => new Promise((resolve, reject) => {
      ctx.signal.addEventListener('abort', () => {
        sawAbort = true
        reject(abortReason(ctx.signal))
      })
    }),
  }
  const broker = new Broker({ config: { dataDir: dir }, api, stages, heartbeatOptions: { intervalMs: 20 } })
  const outcome = await broker.runJob(job)
  assert.equal(outcome, 'aborted:lease_lost')
  assert.equal(sawAbort, true)
  assert.deepEqual(sent, [])
})

test('כשל שלב → failure עם המחלקה והקוד; resetAt כ-ISO', async (t) => {
  const dir = await tempDir(t)
  const failures = []
  const { quota } = await import('../src/errors.js')
  const api = { heartbeat: async () => ({}), failure: async (id, token, f) => { failures.push(f); return { json: { status: 'waiting_quota' } } } }
  const stages = { hashes: async () => { throw quota('claude_quota', 'מכסה', new Date('2030-01-01T00:00:00Z')) } }
  const outcome = await new Broker({ config: { dataDir: dir }, api, stages }).runJob(job)
  assert.equal(outcome, 'failure:quota:claude_quota')
  assert.equal(failures[0].failureClass, 'quota')
  assert.equal(failures[0].resetAt, '2030-01-01T00:00:00.000Z')
})

test('לולאה ראשית: 503 (שבת), שגיאת רשת ו-204 אינם מפילים את המתווך', async (t) => {
  const dir = await tempDir(t)
  const seq = [
    () => { throw new HttpError(503, null, { retryable: true, retryAfterMs: 5 }) },
    () => { throw new HttpError(0, 'network', { retryable: true }) },
    () => ({ job: null, retryAfterMs: 5 }),
  ]
  let claims = 0
  let broker
  const api = {
    maintenance: async () => ({ keep: [] }),
    claim: async () => {
      const step = seq[claims++]
      if (!step) {
        broker.stop('test')
        return { job: null }
      }
      return step()
    },
  }
  broker = new Broker({ config: { dataDir: dir }, api, idlePollMs: 5, backoffBaseMs: 5 })
  await broker.run()
  assert.equal(claims, 4)
})

test('לולאה ראשית: קוד שהתעדכן בדיסק → המשימה הפעילה מסתיימת, ורק אז יציאה לאתחול', async (t) => {
  const dir = await tempDir(t)
  let code = 'v1'
  const events = []
  const api = {
    maintenance: async () => ({ keep: [] }),
    claim: async () => {
      events.push('claim')
      return { job }
    },
  }
  const broker = new Broker({ config: { dataDir: dir }, api, idlePollMs: 5, codeFingerprint: async () => code })
  broker.runJob = async () => {
    events.push('job_start')
    code = 'v2' // הפריסה מחליפה את העותק באמצע המשימה
    events.push('job_end')
  }
  await broker.run()
  assert.deepEqual(events, ['claim', 'job_start', 'job_end'])
  assert.equal(broker.restartRequested, true)
})

test('לולאה ראשית: טביעה זהה או כשל בחישובה אינם מאתחלים', async (t) => {
  const dir = await tempDir(t)
  let claims = 0
  let calls = 0
  let broker
  const api = {
    maintenance: async () => ({ keep: [] }),
    claim: async () => {
      if (++claims === 3) broker.stop('test')
      return { job: null, retryAfterMs: 5 }
    },
  }
  const fingerprint = async () => {
    if (++calls === 2) throw new Error('EIO')
    return 'same'
  }
  broker = new Broker({ config: { dataDir: dir }, api, idlePollMs: 5, codeFingerprint: fingerprint })
  await broker.run()
  assert.equal(claims, 3)
  assert.equal(broker.restartRequested, false)
})

test('codeFingerprint: משתנה בשינוי תוכן, בקובץ חדש ובמחיקה; יציב אחרת', async (t) => {
  const dir = await tempDir(t)
  await mkdir(path.join(dir, 'src', 'stages'), { recursive: true })
  await writeFile(path.join(dir, 'src', 'a.js'), 'a')
  await writeFile(path.join(dir, 'src', 'stages', 'b.js'), 'b')
  await writeFile(path.join(dir, 'lib.js'), 'l')
  const paths = [path.join(dir, 'src'), path.join(dir, 'lib.js')]
  const base = await codeFingerprint(paths)
  assert.equal(await codeFingerprint(paths), base)
  await writeFile(path.join(dir, 'src', 'stages', 'b.js'), 'B')
  const changed = await codeFingerprint(paths)
  assert.notEqual(changed, base)
  await writeFile(path.join(dir, 'src', 'c.js'), 'c')
  const added = await codeFingerprint(paths)
  assert.notEqual(added, changed)
  await rm(path.join(dir, 'lib.js'))
  assert.notEqual(await codeFingerprint(paths), added)
})

test('codeFingerprint: עוקב אחרי ייבוא יחסי אל מחוץ לנתיבים, גם בעומק', async (t) => {
  const dir = await tempDir(t)
  await mkdir(path.join(dir, 'broker', 'src'), { recursive: true })
  await mkdir(path.join(dir, 'lib', 'shared'), { recursive: true })
  await writeFile(path.join(dir, 'broker', 'src', 'main.js'), "import { p } from '../../lib/policy.js'\nexport { a } from \"../../lib/auth.js\"\n")
  await writeFile(path.join(dir, 'lib', 'policy.js'), "import x from './shared/deep.js'\n")
  await writeFile(path.join(dir, 'lib', 'auth.js'), 'auth')
  await writeFile(path.join(dir, 'lib', 'shared', 'deep.js'), 'one')
  await writeFile(path.join(dir, 'lib', 'unrelated.js'), 'u')
  const paths = [path.join(dir, 'broker', 'src')]
  const base = await codeFingerprint(paths)
  await writeFile(path.join(dir, 'lib', 'unrelated.js'), 'U')
  assert.equal(await codeFingerprint(paths), base)
  await writeFile(path.join(dir, 'lib', 'shared', 'deep.js'), 'two')
  const deep = await codeFingerprint(paths)
  assert.notEqual(deep, base)
  await writeFile(path.join(dir, 'lib', 'auth.js'), 'AUTH')
  assert.notEqual(await codeFingerprint(paths), deep)
})

test('codeFingerprint: ברירת המחדל מכסה את הקוד שהמתווך טוען, כולל קובצי האתר המשותפים', async () => {
  const files = await codeFiles()
  const repo = path.resolve(import.meta.dirname, '..', '..', '..')
  for (const shared of ['servicePlugins/policy.js', 'servicePlugins/workerAuth.js', 'servicePlugins/config.js',
    'pluginArchive.js', 'pluginLimits.js']) {
    const file = path.join(repo, 'src', 'lib', shared)
    assert.ok(files.has(file), shared)
    assert.ok(files.get(file), `${shared} קיים`)
  }
  assert.ok(![...files.values()].includes(null), 'כל הייבוא היחסי נמצא בדיסק')
  assert.match(await codeFingerprint(), /^[0-9a-f]{64}$/)
})

test('WorkerApi: 204 עם Retry-After, 409 lease_lost, 503 ניתן לניסיון חוזר; הסוד רק בכותרת', async () => {
  const seen = []
  const responses = [
    new Response(null, { status: 204, headers: { 'retry-after': '120' } }),
    new Response(JSON.stringify({ error: 'lease_lost' }), { status: 409 }),
    new Response('<html>שבת</html>', { status: 503, headers: { 'retry-after': '60' } }),
  ]
  const api = new WorkerApi({ siteUrl: 'https://site.test', workerSecret: 'S'.repeat(50), workerId: 'w1',
    fetchImpl: async (url, init) => { seen.push({ url, init }); return responses.shift() } })
  assert.deepEqual(await api.claim(), { job: null, retryAfterMs: 120_000 })
  await assert.rejects(api.heartbeat(REVIEW_ID, 'tok'), LeaseLostError)
  await assert.rejects(api.heartbeat(REVIEW_ID, 'tok'), (e) => e instanceof HttpError && e.retryable && e.retryAfterMs === 60_000)
  assert.equal(seen[0].url, 'https://site.test/api/service-plugins/worker/claim')
  assert.equal(seen[0].init.headers.authorization, `Bearer ${'S'.repeat(50)}`)
  assert.ok(!seen[1].init.body.includes('S'.repeat(50)))
  assert.throws(() => api.openAsset('../x', 'plugin', 't'))
  assert.throws(() => api.openAsset(REVIEW_ID, '../../etc', 't'))
})

test('תחזוקה: מחיקת תיקיות עבודה ותמונות מקור שאינן ברשימת השמירה', async (t) => {
  const dir = await tempDir(t)
  const keepId = '1'.repeat(24)
  const dropId = '2'.repeat(24)
  for (const sub of ['jobs', 'private', 'snapshots']) {
    for (const id of [keepId, dropId, 'not-an-id']) await mkdir(path.join(dir, sub, id), { recursive: true })
  }
  assert.equal(keepSetFrom({ keep: 'x' }), null)
  assert.equal(keepSetFrom({ keep: [{ pluginId: 'p' }] }), null)
  const keep = keepSetFrom({ keep: [{ pluginId: 'p', reviewIds: [keepId, '../../etc'] }] })
  assert.deepEqual([...keep], [keepId])
  const removed = await pruneDataDir(dir, keep)
  assert.deepEqual(removed.sort(), [`jobs/${dropId}`, `private/${dropId}`, `snapshots/${dropId}`])
  assert.deepEqual((await readdir(path.join(dir, 'jobs'))).sort(), [keepId, 'not-an-id'].sort())
})
