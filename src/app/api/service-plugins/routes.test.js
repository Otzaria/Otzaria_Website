// @vitest-environment node
// ראוטי /api/service-plugins מקצה לקצה מול MongoDB אמיתי: הרשאות, CSRF, מתג, העלאה בזרימה, מתווך והורדה.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  validate: vi.fn(),
  manifest: vi.fn(),
  shabbat: vi.fn(),
}))
vi.mock('@/lib/shabbat-cache', () => ({ shabbatGate: { isAssurBemlacha: mocks.shabbat } }))
vi.mock('@/lib/db', () => ({ default: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))
vi.mock('@/lib/pluginValidation', () => ({ validatePluginArchive: mocks.validate }))
vi.mock('@/lib/pluginManifest', () => ({ readManifestFromPlugin: mocks.manifest }))
vi.mock('@/lib/emailService', () => ({ sendPluginApprovalNotification: vi.fn().mockResolvedValue({ sent: false }) }))
vi.mock('@/lib/systemMessages', () => ({ createSystemMessage: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/cacheTags', () => ({ revalidateNow: vi.fn(), CACHE_TAGS: { PLUGINS_PUBLIC: 'plugins-public' } }))

import Plugin from '@/models/Plugin'
import User from '@/models/User'
import ServicePluginReview from '@/models/ServicePluginReview'
import '@/models/ServiceScanControl'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import { REQUIRED_RECEIPTS, LIMITS } from '@/lib/servicePlugins/policy'
import { GET as publicGET } from './[pluginId]/route'
import { GET as manageGET } from './[pluginId]/manage/route'
import { POST as draftsPOST } from './[pluginId]/drafts/route'
import { DELETE as draftDELETE } from './[pluginId]/drafts/[reviewId]/route'
import { PUT as assetPUT } from './[pluginId]/drafts/[reviewId]/assets/[key]/route'
import { POST as sealPOST } from './[pluginId]/drafts/[reviewId]/seal/route'
import { GET as downloadGET } from './[pluginId]/download/[reviewId]/[fileKey]/route'
import { POST as rollbackPOST } from './[pluginId]/rollback/route'
import { GET as adminGET } from './admin/route'
import { POST as adminPOST } from './admin/[pluginId]/route'
import { POST as claimPOST } from './worker/claim/route'
import { POST as heartbeatPOST } from './worker/[reviewId]/heartbeat/route'
import { POST as checkpointPOST } from './worker/[reviewId]/checkpoint/route'
import { POST as failurePOST } from './worker/[reviewId]/failure/route'
import { POST as resultPOST } from './worker/[reviewId]/result/route'
import { GET as workerAssetGET } from './worker/[reviewId]/asset/[key]/route'
import { POST as maintenancePOST } from './worker/maintenance/route'
import { POST as cronPOST } from '../cron/service-plugins-cleanup/route'

vi.setConfig({ testTimeout: 30000 })

const SECRET = 'Zt7wq1Xk9PbN3vLm8RsY2cHd6FgJ4aUe0oTiQyWxVn5'
const COMMIT = '0123456789012345678901234567890123456789'
const BASE = 'http://localhost/api/service-plugins'
const PLUGIN_BYTES = Buffer.from('PK-plugin')
const NATIVE_BYTES = Buffer.from('MZ-installer!')
const sha = (b) => createHash('sha256').update(b).digest('hex')

let db
let storageDir
let owner
let admin
let stranger
let plugin

const savedEnv = {}
const ENV = { SERVICE_PLUGINS_ENABLED: '1', SERVICE_PLUGIN_WORKER_SECRET: SECRET, CRON_SECRET: 'cron-secret' }

beforeAll(async () => {
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'svc-routes-'))
  for (const [k, v] of Object.entries({ ...ENV, SERVICE_PLUGIN_STORAGE_DIR: storageDir })) {
    savedEnv[k] = process.env[k]
    process.env[k] = v
  }
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  await rm(storageDir, { recursive: true, force: true })
})

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  process.env.SERVICE_PLUGINS_ENABLED = '1'
  process.env.SERVICE_PLUGIN_WORKER_SECRET = SECRET
  mocks.validate.mockResolvedValue({ errors: [], warnings: [] })
  mocks.shabbat.mockResolvedValue(false)
  owner = await User.create({ name: 'מפתחת', email: 'dev@example.org', password: 'x' })
  admin = await User.create({ name: 'מנהל', email: 'admin@example.org', password: 'x', role: 'admin_plugins' })
  stranger = await User.create({ name: 'זר', email: 's@example.org', password: 'x' })
  plugin = await Plugin.create({
    name: 'שירות', slug: 'my-service', shortDescription: 'ת', description: 'ת', version: '1.0.0', author: 'מפתחת', authorId: owner._id,
    compatibleWith: '0.9.50', pluginFileName: 'p.otzplugin', pluginFileExt: '.otzplugin', pluginUid: 'org.example.svc', hasService: true,
  })
  mocks.manifest.mockResolvedValue({ id: 'org.example.svc', version: '1.0.0', minAppVersion: '0.9.60' })
})

const as = (u) => mocks.session.mockResolvedValue(u ? { user: { id: String(u._id), name: u.name, role: u.role || 'user' } } : null)
const p = (o) => ({ params: Promise.resolve(o) })
const jsonReq = (url, method, body, headers = {}) => new Request(url, {
  method, headers: { 'content-type': 'application/json', origin: 'http://localhost', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const worker = (url, body, headers = {}) => new Request(url, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET}`, ...headers }, body: JSON.stringify(body ?? {}),
})
const putReq = (url, bytes, headers = {}) => new Request(url.startsWith('/') ? `http://localhost${url}` : url, {
  method: 'PUT', headers: { origin: 'http://localhost', 'content-length': String(bytes.length), ...headers }, body: bytes, duplex: 'half',
})
const draftBody = (extra = {}) => ({
  kind: 'service', pluginVersion: '1.0.0', pluginSize: PLUGIN_BYTES.length, serviceVersion: '1.0.0', serviceRange: { min: '1.0.0', max: null },
  sources: [{ repository: 'OWNER/REPO', commit: COMMIT }], changeNotes: 'ראשונה', uninstall: 'הסרה רגילה', virusTotalConsent: false,
  assets: [{ name: 'setup.exe', size: NATIVE_BYTES.length, os: 'windows', arch: 'x64', minOs: 'Windows 10', port: 18090, bundledPluginPath: 'plugin.otzplugin', releaseUrl: 'https://github.com/OWNER/REPO/releases/download/v1/setup.exe' }],
  ...extra,
})
const pid = () => String(plugin._id)

async function createDraftViaRoute() {
  as(owner)
  const res = await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', draftBody()), p({ pluginId: pid() }))
  expect(res.status).toBe(201)
  return res.json()
}

describe('מתג, הרשאות ו-CSRF', () => {
  it('מתג כבוי → 404 disabled בנתיבי הדפדפן ו-403 worker_api_disabled במתווך', async () => {
    process.env.SERVICE_PLUGINS_ENABLED = '0'
    as(owner)
    for (const res of [
      await publicGET(new Request(`${BASE}/${pid()}`), p({ pluginId: pid() })),
      await manageGET(new Request(`${BASE}/${pid()}/manage`), p({ pluginId: pid() })),
      await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', draftBody()), p({ pluginId: pid() })),
      await adminGET(new Request(`${BASE}/admin`)),
    ]) {
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'disabled' })
    }
    const w = await claimPOST(worker(`${BASE}/worker/claim`, { workerId: 'b' }))
    expect(w.status).toBe(403)
    expect(await w.json()).toEqual({ error: 'worker_api_disabled' })
  })

  it('מתווך: סוד חלש משבית, סוד שגוי → 401', async () => {
    process.env.SERVICE_PLUGIN_WORKER_SECRET = 'short'
    expect((await claimPOST(worker(`${BASE}/worker/claim`, { workerId: 'b' }))).status).toBe(403)
    process.env.SERVICE_PLUGIN_WORKER_SECRET = SECRET
    const bad = await claimPOST(worker(`${BASE}/worker/claim`, { workerId: 'b' }, { authorization: `Bearer ${SECRET}x` }))
    expect(bad.status).toBe(401)
    expect(bad.headers.get('www-authenticate')).toMatch(/^Bearer/)
    expect(await bad.json()).toEqual({ error: 'unauthorized' })
    expect(bad.headers.get('cache-control')).toBe('private, no-store')
  })

  it('כתיבה מדפדפן ממקור זר נחסמת; בלי session → 401; לא-בעלים → 403; גוף גדול → 413', async () => {
    as(owner)
    const cross = await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', draftBody(), { origin: 'https://evil.example' }), p({ pluginId: pid() }))
    expect(cross.status).toBe(403)
    expect((await cross.json()).error).toBe('csrf_rejected')
    const site = await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', draftBody(), { 'sec-fetch-site': 'cross-site' }), p({ pluginId: pid() }))
    expect(site.status).toBe(403)
    as(null)
    expect((await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', draftBody()), p({ pluginId: pid() }))).status).toBe(401)
    as(stranger)
    expect((await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', draftBody()), p({ pluginId: pid() }))).status).toBe(403)
    expect((await manageGET(new Request(`${BASE}/${pid()}/manage`), p({ pluginId: pid() }))).status).toBe(403)
    expect((await adminGET(new Request(`${BASE}/admin`))).status).toBe(403)
    as(owner)
    const big = await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', { ...draftBody(), changeNotes: 'x'.repeat(LIMITS.jsonBodyBytes) }), p({ pluginId: pid() }))
    expect(big.status).toBe(413)
  })

  it('ציבורי: 404 לתוסף שלא פורסם או למזהה לא תקין', async () => {
    expect((await publicGET(new Request(`${BASE}/${pid()}`), p({ pluginId: pid() }))).status).toBe(404)
    expect((await publicGET(new Request(`${BASE}/x`), p({ pluginId: '../x' }))).status).toBe(404)
  })
})

describe('זרימה מלאה דרך הראוטים', () => {
  it('הגשה → העלאה בזרימה → הקפאה → מנהל → מתווך → פרסום → הורדה', async () => {
    const { reviewId, uploads } = await createDraftViaRoute()
    expect(Object.keys(uploads)).toEqual(['plugin', 'native0'])
    const asset = (key) => ({ pluginId: pid(), reviewId, key })

    // Content-Length: חסר/שונה/מעל המגבלה נדחים לפני קריאה
    const noLength = new Request(`http://localhost${uploads.plugin}`, { method: 'PUT', headers: { origin: 'http://localhost' }, body: PLUGIN_BYTES, duplex: 'half' })
    noLength.headers.delete('content-length')
    expect((await assetPUT(noLength, p(asset('plugin')))).status).toBe(400)
    expect((await assetPUT(putReq(uploads.plugin, PLUGIN_BYTES, { 'content-length': '3' }), p(asset('plugin')))).status).toBe(400)
    expect((await assetPUT(putReq(uploads.plugin, PLUGIN_BYTES, { 'content-length': String(LIMITS.pluginBytes + 1) }), p(asset('plugin')))).status).toBe(413)
    expect((await assetPUT(putReq(uploads.plugin, PLUGIN_BYTES), p(asset('native9')))).status).toBe(404)
    as(stranger)
    expect((await assetPUT(putReq(uploads.plugin, PLUGIN_BYTES), p(asset('plugin')))).status).toBe(403)
    as(owner)

    const put = await assetPUT(putReq(uploads.plugin, PLUGIN_BYTES), p(asset('plugin')))
    expect(put.status).toBe(200)
    expect(await put.json()).toEqual({ key: 'plugin', sha256: sha(PLUGIN_BYTES), size: PLUGIN_BYTES.length })
    const again = await assetPUT(putReq(uploads.plugin, PLUGIN_BYTES), p(asset('plugin')))
    expect(again.status).toBe(409)

    const early = await sealPOST(jsonReq(`${BASE}/x/seal`, 'POST'), p({ pluginId: pid(), reviewId }))
    expect(early.status).toBe(400)
    expect((await early.json()).errors.join()).toMatch(/native0/)
    expect((await assetPUT(putReq(uploads.native0, NATIVE_BYTES), p(asset('native0')))).status).toBe(200)
    const sealRes = await sealPOST(jsonReq(`${BASE}/x/seal`, 'POST'), p({ pluginId: pid(), reviewId }))
    expect(sealRes.status).toBe(200)
    const { digest } = await sealRes.json()

    const manage = await (await manageGET(new Request(`${BASE}/${pid()}/manage`), p({ pluginId: pid() }))).json()
    expect(manage.reviews[0]).toMatchObject({ id: reviewId, status: 'pending_admin', uploads: { plugin: true, native0: true } })
    expect(manage.cooldown.blocked).toBe(false)

    as(admin)
    const list = await (await adminGET(new Request(`${BASE}/admin`))).json()
    expect(list.reviews[0]).toMatchObject({ id: reviewId, pluginName: 'שירות', ownerName: 'מפתחת', status: 'pending_admin' })
    expect((await adminPOST(jsonReq(`${BASE}/admin/${pid()}`, 'POST', { action: 'nope' }), p({ pluginId: pid() }))).status).toBe(400)
    const start = await adminPOST(jsonReq(`${BASE}/admin/${pid()}`, 'POST', { action: 'start', jobId: reviewId }), p({ pluginId: pid() }))
    expect(start.status).toBe(200)
    as(owner)
    expect((await draftDELETE(jsonReq(`${BASE}/x`, 'DELETE'), p({ pluginId: pid(), reviewId }))).status).toBe(409)

    const claim = await claimPOST(worker(`${BASE}/worker/claim`, { workerId: 'broker-1' }))
    expect(claim.status).toBe(200)
    const { job } = await claim.json()
    expect(job).toMatchObject({ reviewId, manifestDigest: digest, kind: 'service' })
    expect((await claimPOST(worker(`${BASE}/worker/claim`, { workerId: 'broker-2' }))).status).toBe(204)

    const wa = await workerAssetGET(new Request(`${BASE}/worker/${reviewId}/asset/native0`, { headers: { authorization: `Bearer ${SECRET}`, 'x-lease-token': job.leaseToken } }), p({ reviewId, key: 'native0' }))
    expect(wa.status).toBe(200)
    expect(wa.headers.get('x-content-sha256')).toBe(sha(NATIVE_BYTES))
    expect(Buffer.from(await wa.arrayBuffer())).toEqual(NATIVE_BYTES)

    const hb = await heartbeatPOST(worker(`${BASE}/worker/${reviewId}/heartbeat`, { leaseToken: job.leaseToken }), p({ reviewId }))
    expect(hb.status).toBe(200)
    expect(await heartbeatPOST(worker(`${BASE}/worker/${reviewId}/heartbeat`, { leaseToken: 'C'.repeat(43) }), p({ reviewId })).then((r) => r.status)).toBe(409)
    for (const stage of REQUIRED_RECEIPTS.service) {
      const r = await checkpointPOST(worker(`${BASE}/worker/${reviewId}/checkpoint`, { leaseToken: job.leaseToken, stage, digest, data: { ok: true } }), p({ reviewId }))
      expect(r.status).toBe(200)
    }
    const badFailure = await failurePOST(worker(`${BASE}/worker/${reviewId}/failure`, { leaseToken: job.leaseToken, class: 'weird', code: 'x' }), p({ reviewId }))
    expect(badFailure.status).toBe(400)
    const result = await resultPOST(worker(`${BASE}/worker/${reviewId}/result`, { leaseToken: job.leaseToken, digest, decision: 1, report: 'נבדק ותקין' }), p({ reviewId }))
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ status: 'approved', published: true })

    const pub = await publicGET(new Request(`${BASE}/${pid()}`), p({ pluginId: pid() }))
    expect(pub.status).toBe(200)
    expect(pub.headers.get('cache-control')).toBe('public, max-age=60')
    const info = await pub.json()
    expect(info).toMatchObject({
      pluginId: pid(), pluginUid: 'org.example.svc', slug: 'my-service',
      detection: { path: '/.well-known/otzaria-service', protocolVersion: 1, serviceId: 'org.example.svc' },
      current: {
        reviewId, serviceVersion: '1.0.0', serviceRange: { min: '1.0.0', max: null }, pluginVersion: '1.0.0', uninstall: 'הסרה רגילה',
        pluginDownloadUrl: `/api/service-plugins/${pid()}/download/${reviewId}/plugin`,
        platforms: [{ os: 'windows', arch: 'x64', minOs: 'Windows 10', port: 18090, name: 'setup.exe', size: NATIVE_BYTES.length, sha256: sha(NATIVE_BYTES), downloadUrl: `/api/service-plugins/${pid()}/download/${reviewId}/native0` }],
      },
      previous: null,
    })

    const dl = await downloadGET(new Request(`http://localhost${info.current.pluginDownloadUrl}`), p({ pluginId: pid(), reviewId, fileKey: 'plugin' }))
    expect(dl.status).toBe(200)
    expect(dl.headers.get('content-length')).toBe(String(PLUGIN_BYTES.length))
    expect(dl.headers.get('x-content-sha256')).toBe(sha(PLUGIN_BYTES))
    expect(dl.headers.get('content-disposition')).toContain('my-service-1.0.0.otzplugin')
    expect(Buffer.from(await dl.arrayBuffer())).toEqual(PLUGIN_BYTES)
    const native = await downloadGET(new Request('http://localhost/x'), p({ pluginId: pid(), reviewId, fileKey: 'native0' }))
    expect(native.headers.get('content-disposition')).toContain('setup.exe')
    expect((await downloadGET(new Request('http://localhost/x'), p({ pluginId: pid(), reviewId: 'abcdefabcdefabcdefabcdef', fileKey: 'native0' }))).status).toBe(404)
    await Plugin.updateOne({ _id: plugin._id }, { $set: { isSuspended: true } })
    expect((await downloadGET(new Request('http://localhost/x'), p({ pluginId: pid(), reviewId, fileKey: 'plugin' }))).status).toBe(404)
    expect((await publicGET(new Request(`${BASE}/${pid()}`), p({ pluginId: pid() }))).status).toBe(404)

    const roll = await rollbackPOST(jsonReq(`${BASE}/${pid()}/rollback`, 'POST'), p({ pluginId: pid() }))
    expect(roll.status).toBe(409)
    expect((await roll.json()).code).toBe('no_previous')

    const keep = await (await maintenancePOST(worker(`${BASE}/worker/maintenance`, {}))).json()
    expect(keep).toEqual({ keep: [{ pluginId: pid(), reviewIds: [reviewId] }] })

    expect((await cronPOST(new Request('http://localhost/api/cron/service-plugins-cleanup', { method: 'POST' }))).status).toBe(401)
    const cron = await cronPOST(new Request('http://localhost/api/cron/service-plugins-cleanup', { method: 'POST', headers: { authorization: 'Bearer cron-secret' } }))
    expect(cron.status).toBe(200)
    expect(await cron.json()).toMatchObject({ success: true, errors: [] })
  })

  it('מנהל: חריגה, ביטול ודחיית 21 יום בעברית', async () => {
    const { reviewId } = await createDraftViaRoute()
    await Plugin.updateOne({ _id: plugin._id }, { $set: { 'serviceState.lastServiceCycleStartedAt': new Date() } })
    as(owner)
    const putUrl = (k) => `${BASE}/${pid()}/drafts/${reviewId}/assets/${k}`
    await assetPUT(putReq(putUrl('plugin'), PLUGIN_BYTES), p({ pluginId: pid(), reviewId, key: 'plugin' }))
    await assetPUT(putReq(putUrl('native0'), NATIVE_BYTES), p({ pluginId: pid(), reviewId, key: 'native0' }))
    expect((await sealPOST(jsonReq(`${BASE}/x`, 'POST'), p({ pluginId: pid(), reviewId }))).status).toBe(200)
    as(admin)
    const blocked = await adminPOST(jsonReq(`${BASE}/admin/${pid()}`, 'POST', { action: 'start' }), p({ pluginId: pid() }))
    expect(blocked.status).toBe(409)
    const body = await blocked.json()
    expect(body.code).toBe('cooldown')
    expect(body.error).toMatch(/חריגת מנהל/)
    expect(body.nextAllowedAt).toBeTruthy()
    expect((await adminPOST(jsonReq(`${BASE}/admin/${pid()}`, 'POST', { action: 'emergency', reason: 'דחוף' }), p({ pluginId: pid() }))).status).toBe(200)
    expect((await adminPOST(jsonReq(`${BASE}/admin/${pid()}`, 'POST', { action: 'start' }), p({ pluginId: pid() }))).status).toBe(200)
    const cancel = await adminPOST(jsonReq(`${BASE}/admin/${pid()}`, 'POST', { action: 'cancel', jobId: reviewId, reason: 'בדיקה' }), p({ pluginId: pid() }))
    expect(await cancel.json()).toMatchObject({ ok: true, status: 'cancelled' })
    expect((await Plugin.findById(plugin._id).lean()).serviceState.activeReviewId).toBeNull()
  })
})

describe('תיקוני QA בראוטים', () => {
  const assetUrl = (reviewId, key) => `${BASE}/${pid()}/drafts/${reviewId}/assets/${key}`

  it('יצירת טיוטות מוגבלת בקצב למשתמש (429)', async () => {
    as(owner)
    for (let i = 0; i < 10; i++) {
      const res = await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', draftBody({ serviceVersion: 'x' })), p({ pluginId: pid() }))
      expect(res.status).toBe(400)
    }
    const limited = await draftsPOST(jsonReq(`${BASE}/${pid()}/drafts`, 'POST', draftBody()), p({ pluginId: pid() }))
    expect(limited.status).toBe(429)
    expect((await limited.json()).code).toBe('rate_limited')
  })

  it('קובץ שנכתב אך לא נרשם במסד נמחק, וההעלאה אפשרית שוב', async () => {
    const { reviewId } = await createDraftViaRoute()
    const args = p({ pluginId: pid(), reviewId, key: 'plugin' })
    const spy = vi.spyOn(ServicePluginReview, 'updateOne')
    spy.mockResolvedValueOnce({ acknowledged: true, matchedCount: 0, modifiedCount: 0 })
    expect((await assetPUT(putReq(assetUrl(reviewId, 'plugin'), PLUGIN_BYTES), args)).status).toBe(409)
    expect(await readdir(path.join(storageDir, reviewId))).toEqual([])
    spy.mockRejectedValueOnce(new Error('db down'))
    expect((await assetPUT(putReq(assetUrl(reviewId, 'plugin'), PLUGIN_BYTES), args)).status).toBe(500)
    expect(await readdir(path.join(storageDir, reviewId))).toEqual([])
    spy.mockRestore()
    expect((await assetPUT(putReq(assetUrl(reviewId, 'plugin'), PLUGIN_BYTES), args)).status).toBe(200)
  })

  it('העלאת קובץ (מוחרגת מה-proxy) נחסמת בשבת בעצמה, באותה תשובת JSON', async () => {
    const { reviewId } = await createDraftViaRoute()
    mocks.shabbat.mockResolvedValue(true)
    const res = await assetPUT(putReq(assetUrl(reviewId, 'plugin'), PLUGIN_BYTES), p({ pluginId: pid(), reviewId, key: 'plugin' }))
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('3600')
    expect(await res.json()).toEqual({ error: 'shabbat', message: 'הדף אינו פעיל בשבת ובימים טובים לפי שעון ירושלים' })
    await expect(readdir(path.join(storageDir, reviewId))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('manage מחזיר viewerIsOwner לבעלים בלבד', async () => {
    as(owner)
    expect((await (await manageGET(new Request(`${BASE}/${pid()}/manage`), p({ pluginId: pid() }))).json()).viewerIsOwner).toBe(true)
    as(admin)
    expect((await (await manageGET(new Request(`${BASE}/${pid()}/manage`), p({ pluginId: pid() }))).json()).viewerIsOwner).toBe(false)
  })
})
