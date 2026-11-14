// @vitest-environment node
// פעולות הדומיין של תוספי השירות מול MongoDB אמיתי (mongodb-memory-server). בלי הבינארי — מדולג.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  manifest: vi.fn(),
  email: vi.fn(),
  systemMessage: vi.fn(),
  revalidate: vi.fn(),
}))
vi.mock('@/lib/pluginValidation', () => ({ validatePluginArchive: mocks.validate }))
vi.mock('@/lib/pluginManifest', () => ({ readManifestFromPlugin: mocks.manifest }))
vi.mock('@/lib/emailService', () => ({ sendPluginApprovalNotification: mocks.email }))
vi.mock('@/lib/systemMessages', () => ({ createSystemMessage: mocks.systemMessage }))
vi.mock('@/lib/cacheTags', () => ({ revalidateNow: mocks.revalidate, CACHE_TAGS: { PLUGINS_PUBLIC: 'plugins-public' } }))

import Plugin from '@/models/Plugin'
import User from '@/models/User'
import ServicePluginReview from '@/models/ServicePluginReview'
import ServiceScanControl from '@/models/ServiceScanControl'
import { startMongo } from '@/lib/corrections/testing/mongo.js'
import {
  createDraft, recordAssetUpload, sealDraft, cancelReview, adminStart, adminRetry, adminEmergency, rollback,
  claimNext, heartbeat, checkpoint, reportFailure, submitResult, maintenanceKeepList, openWorkerAsset, finalizeIfPublished,
} from './reviews.js'
import { getAdminView } from './views.js'
import { runServicePluginCleanup } from './cleanup.js'
import { writeReviewAssetStream } from './storage.js'
import { REQUIRED_RECEIPTS, submissionDigest, LEASE_SECONDS } from './policy.js'

vi.setConfig({ testTimeout: 30000 })

const COMMIT = '0123456789012345678901234567890123456789'
const DAY = 24 * 3600_000
let db
let storageDir
let owner
let other
let admin
let seq = 0

beforeAll(async () => {
  storageDir = await mkdtemp(path.join(os.tmpdir(), 'svc-reviews-'))
  process.env.SERVICE_PLUGIN_STORAGE_DIR = storageDir
  db = await startMongo()
}, 120000)
afterAll(async () => {
  if (db && !db.skip) await db.stop()
  await rm(storageDir, { recursive: true, force: true })
  delete process.env.SERVICE_PLUGIN_STORAGE_DIR
})

beforeEach(async (ctx) => {
  if (db.skip) return ctx.skip()
  await db.reset()
  vi.clearAllMocks()
  mocks.validate.mockResolvedValue({ errors: [], warnings: [] })
  mocks.email.mockResolvedValue({ sent: true })
  mocks.systemMessage.mockResolvedValue({})
  owner = await User.create({ name: 'מפתחת', email: 'dev@example.org', password: 'x' })
  other = await User.create({ name: 'אחר', email: 'other@example.org', password: 'x' })
  admin = await User.create({ name: 'מנהל', email: 'admin@example.org', password: 'x', role: 'admin_plugins' })
})

async function makePlugin(extra = {}) {
  seq++
  return Plugin.create({
    name: `שירות ${seq}`, slug: `svc-${seq}`, shortDescription: 'תיאור', description: 'תיאור ארוך', version: '1.0.0',
    author: 'מפתחת', authorId: owner._id, compatibleWith: '0.9.50', pluginFileName: 'p.otzplugin', pluginFileExt: '.otzplugin',
    pluginUid: `org.example.svc${seq}`, hasService: true, ...extra,
  })
}
const loadPlugin = (id) => Plugin.findById(id).lean()
const loadReview = (id) => ServicePluginReview.findById(id).lean()

const asset = (extra = {}) => ({
  name: 'setup.exe', size: 6, os: 'windows', arch: 'x64', minOs: 'Windows 10', port: 18090,
  bundledPluginPath: 'plugin.otzplugin', releaseUrl: 'https://github.com/OWNER/REPO/releases/download/v1/setup.exe', ...extra,
})
const serviceBody = (extra = {}) => ({
  kind: 'service', pluginVersion: '1.0.0', pluginSize: 5, serviceVersion: '1.0.0', serviceRange: { min: '1.0.0', max: null },
  sources: [{ repository: 'OWNER/REPO', commit: COMMIT }], changeNotes: 'ראשונה', uninstall: 'הסרה רגילה', assets: [asset()], ...extra,
})
const pluginBody = (extra = {}) => ({
  kind: 'plugin', pluginVersion: '1.1.0', pluginSize: 5, serviceRange: { min: '1.0.0', max: null },
  sources: [{ repository: 'OWNER/REPO', commit: COMMIT }], ...extra,
})
const bytes = (n, ch = 'x') => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(ch.repeat(n))); c.close() } })

async function upload(review, key, size) {
  const { sha256 } = await writeReviewAssetStream(review._id, key, bytes(size, key[0]), { expectedSize: size, maxBytes: 1000 })
  const rec = await recordAssetUpload({ review, key, sha256 })
  expect(rec.ok).toBe(true)
}

/** טיוטה → קבצים → הקפאה; מחזיר את ההגשה בממתין למנהל. */
async function sealed(plugin, body) {
  const created = await createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body })
  expect(created.ok, JSON.stringify(created)).toBe(true)
  const review = await loadReview(created.review._id)
  await upload(review, 'plugin', body.pluginSize)
  for (const a of review.assets) await upload(review, a.key, a.size)
  mocks.manifest.mockResolvedValueOnce({ id: plugin.pluginUid, version: body.pluginVersion, minAppVersion: '0.9.60', network: { enabled: true } })
  const res = await sealDraft({ review: await loadReview(review._id), plugin: await loadPlugin(plugin._id) })
  expect(res.ok, JSON.stringify(res)).toBe(true)
  return loadReview(review._id)
}

async function queued(plugin, body, now = new Date()) {
  const review = await sealed(plugin, body)
  const res = await adminStart({ plugin: await loadPlugin(plugin._id), review, admin, now })
  expect(res.ok, JSON.stringify(res)).toBe(true)
  return loadReview(review._id)
}

async function allReceipts(job) {
  for (const stage of REQUIRED_RECEIPTS[job.kind]) {
    const r = await checkpoint({ reviewId: job.reviewId, token: job.leaseToken, stage, digest: job.manifestDigest, data: { ok: true } })
    expect(r.ok, stage).toBe(true)
  }
}

async function approve(plugin, body) {
  await queued(plugin, body)
  const { job } = await claimNext({ workerId: 'broker-a' })
  await allReceipts(job)
  const res = await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 1, report: 'תקין' })
  expect(res).toEqual({ ok: true, status: 'approved', published: true })
  return loadReview(job.reviewId)
}

describe('יצירת טיוטה', () => {
  it('בעלים בלבד, תוסף שירות בלבד, ולידציה בעברית', async () => {
    const plugin = await makePlugin()
    expect(await createDraft({ plugin: await loadPlugin(plugin._id), user: other, body: serviceBody() })).toMatchObject({ ok: false, status: 403 })
    const plain = await makePlugin({ hasService: false })
    expect(await createDraft({ plugin: await loadPlugin(plain._id), user: owner, body: serviceBody() })).toMatchObject({ ok: false, status: 409, code: 'not_service_plugin' })
    const bad = await createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody({ serviceVersion: 'x' }) })
    expect(bad).toMatchObject({ ok: false, status: 400, code: 'validation_failed' })
    expect(bad.errors.join()).toMatch(/X\.Y\.Z/)
  })

  it('נעילה אטומית: הגשה פעילה אחת לתוסף; ביטול משחרר', async () => {
    const plugin = await makePlugin()
    const [a, b] = await Promise.all([
      createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody() }),
      createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody() }),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    const won = a.ok ? a : b
    expect((a.ok ? b : a).code).toBe('active_review_exists')
    expect(String((await loadPlugin(plugin._id)).serviceState.activeReviewId)).toBe(String(won.review._id))
    expect(won.uploads).toEqual({
      plugin: `/api/service-plugins/${plugin._id}/drafts/${won.review._id}/assets/plugin`,
      native0: `/api/service-plugins/${plugin._id}/drafts/${won.review._id}/assets/native0`,
    })
    const cancelled = await cancelReview({ review: await loadReview(won.review._id), by: owner._id })
    expect(cancelled.ok).toBe(true)
    expect((await loadPlugin(plugin._id)).serviceState.activeReviewId).toBeNull()
    expect((await createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody() })).ok).toBe(true)
  })

  it('עד 3 הגשות פעילות למפתח', async () => {
    for (let i = 0; i < 3; i++) {
      const p = await makePlugin()
      expect((await createDraft({ plugin: await loadPlugin(p._id), user: owner, body: serviceBody({ assets: [asset({ port: 18100 + i })] }) })).ok).toBe(true)
    }
    const p4 = await makePlugin()
    expect(await createDraft({ plugin: await loadPlugin(p4._id), user: owner, body: serviceBody({ assets: [asset({ port: 18200 })] }) }))
      .toMatchObject({ ok: false, status: 429, code: 'too_many_active' })
    expect((await loadPlugin(p4._id)).serviceState?.activeReviewId ?? null).toBeNull()
  })

  it('פורט ייחודי לכל מערכת: נחסם מול הגשה פעילה ומול תוסף מפורסם', async () => {
    const a = await makePlugin()
    expect((await createDraft({ plugin: await loadPlugin(a._id), user: owner, body: serviceBody() })).ok).toBe(true)
    const b = await makePlugin()
    expect(await createDraft({ plugin: await loadPlugin(b._id), user: owner, body: serviceBody() })).toMatchObject({ status: 409, code: 'port_taken' })
    expect((await createDraft({ plugin: await loadPlugin(b._id), user: owner, body: serviceBody({ assets: [asset({ os: 'linux', name: 'a.deb' })] }) })).ok).toBe(true)
    const c = await makePlugin({ serviceState: { ports: [{ os: 'macos', port: 18300 }] } })
    const d = await makePlugin()
    expect(await createDraft({ plugin: await loadPlugin(d._id), user: owner, body: serviceBody({ assets: [asset({ os: 'macos', name: 'a.dmg', port: 18300 })] }) }))
      .toMatchObject({ code: 'port_taken' })
    expect(c).toBeTruthy()
  })
})

describe('העלאה והקפאה', () => {
  it('הקפאה דורשת את כל הקבצים, SDK תקין ומניפסט תואם; digest נשמר', async () => {
    const plugin = await makePlugin()
    const created = await createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody() })
    let review = await loadReview(created.review._id)
    expect(await sealDraft({ review, plugin })).toMatchObject({ status: 400, code: 'missing_files' })
    await upload(review, 'plugin', 5)
    await upload(review, 'native0', 6)
    expect(await recordAssetUpload({ review, key: 'plugin', sha256: 'f'.repeat(64) })).toMatchObject({ ok: false, status: 409 })

    mocks.validate.mockResolvedValueOnce({ errors: [], warnings: ['אזהרה מה-SDK'] })
    review = await loadReview(review._id)
    const sdk = await sealDraft({ review, plugin })
    expect(sdk).toMatchObject({ status: 400, code: 'sdk_validation_failed', errors: ['אזהרה מה-SDK'] })
    expect((await loadReview(review._id)).status).toBe('draft')

    mocks.manifest.mockResolvedValueOnce({ id: 'org.other', version: '1.0.0', minAppVersion: '0.9.60' })
    const mismatch = await sealDraft({ review, plugin })
    expect(mismatch.code).toBe('manifest_mismatch')

    const timeout = Object.assign(new Error('t'), { code: 'PLUGIN_VALIDATION_TIMEOUT' })
    mocks.validate.mockRejectedValueOnce(timeout)
    expect(await sealDraft({ review, plugin })).toMatchObject({ status: 503, code: 'sdk_unavailable' })

    mocks.manifest.mockResolvedValueOnce({ id: plugin.pluginUid, version: '1.0.0', minAppVersion: '0.9.60' })
    const ok = await sealDraft({ review, plugin })
    expect(ok.ok).toBe(true)
    const stored = await loadReview(review._id)
    expect(stored.status).toBe('pending_admin')
    expect(stored.manifestDigest).toBe(ok.digest)
    expect(submissionDigest(stored)).toBe(ok.digest)
  })

  it('הבעלים מבטל רק לפני בחירת מנהל', async () => {
    const plugin = await makePlugin()
    const review = await queued(plugin, serviceBody())
    expect(await cancelReview({ review, by: owner._id })).toMatchObject({ ok: false, status: 409 })
  })
})

describe('21 יום וחריגת מנהל', () => {
  it('התחלת בדיקת שירות נחסמת 21 יום גם אחרי דחייה; חריגה נצרכת פעם אחת; עדכון תוסף פטור', async () => {
    const plugin = await makePlugin()
    const t0 = new Date('2026-10-01T08:00:00Z')
    const first = await queued(plugin, serviceBody(), t0)
    expect((await loadPlugin(plugin._id)).serviceState.lastServiceCycleStartedAt.toISOString()).toBe(t0.toISOString())
    expect(String(first.selectedBy)).toBe(String(admin._id))
    const { job } = await claimNext({ workerId: 'b' })
    await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 0, report: 'נמצאה בעיה' })
    expect(mocks.systemMessage).toHaveBeenCalledWith(expect.objectContaining({ recipientId: owner._id, source: 'service-plugin-review' }))

    const second = await sealed(plugin, serviceBody({ pluginVersion: '1.0.1', serviceVersion: '1.0.1' }))
    const t1 = new Date(t0.getTime() + 10 * DAY)
    const blocked = await adminStart({ plugin: await loadPlugin(plugin._id), review: second, admin, now: t1 })
    expect(blocked).toMatchObject({ ok: false, status: 409, code: 'cooldown' })
    expect(blocked.message).toMatch(/2026/)

    expect((await adminEmergency({ plugin: await loadPlugin(plugin._id), admin, reason: '' })).code).toBe('reason_required')
    expect((await adminEmergency({ plugin: await loadPlugin(plugin._id), admin, reason: 'תיקון אבטחה דחוף' })).ok).toBe(true)
    const started = await adminStart({ plugin: await loadPlugin(plugin._id), review: second, admin, now: t1 })
    expect(started).toMatchObject({ ok: true, exceptionUsed: true })
    const p = await loadPlugin(plugin._id)
    expect(p.serviceState.adminException).toBeNull()
    expect(p.serviceState.lastServiceCycleStartedAt.toISOString()).toBe(t1.toISOString())
    expect((await loadReview(second._id)).exceptionUsed.reason).toBe('תיקון אבטחה דחוף')

    const third = await cancelReview({ review: await loadReview(second._id), by: admin._id, asAdmin: true })
    expect(third.ok).toBe(true)
    const again = await sealed(plugin, serviceBody({ pluginVersion: '1.0.2', serviceVersion: '1.0.2' }))
    expect((await adminStart({ plugin: await loadPlugin(plugin._id), review: again, admin, now: new Date(t1.getTime() + DAY) })).code).toBe('cooldown')
    expect((await adminStart({ plugin: await loadPlugin(plugin._id), review: again, admin, now: new Date(t1.getTime() + 21 * DAY) })).ok).toBe(true)
  })
})

describe('תור, נעילה ו-lease', () => {
  it('שתי תפיסות מקבילות — רק אחת מקבלת עבודה (נעילה גלובלית)', async () => {
    const a = await makePlugin()
    const b = await makePlugin()
    await queued(a, serviceBody())
    await queued(b, serviceBody({ assets: [asset({ port: 18091 })] }))
    const [x, y] = await Promise.all([claimNext({ workerId: 'broker-a' }), claimNext({ workerId: 'broker-b' })])
    expect([x.job, y.job].filter(Boolean)).toHaveLength(1)
    const job = x.job || y.job
    expect(job).toMatchObject({ kind: 'service', fence: 1, policyVersion: 2, attempts: 0, previousApproved: null, approvedService: null })
    expect(job.submission.manifest.id).toMatch(/^org\.example/)
    expect(job.assets[0]).toMatchObject({ key: 'native0', port: 18090, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect((await claimNext({ workerId: 'broker-c' })).job).toBeNull()
    const control = await ServiceScanControl.findOne({ key: 'global' }).lean()
    expect(String(control.lock.reviewId)).toBe(job.reviewId)
    expect((await loadPlugin(job.pluginId)).serviceState.activeFence).toBe(1)

    const fail = await reportFailure({ reviewId: job.reviewId, token: job.leaseToken, failureClass: 'transient', code: 'net', message: 'x' })
    expect(fail.status).toBe('retry_wait')
    expect((await ServiceScanControl.findOne({ key: 'global' }).lean()).lock).toBeNull()
    const next = await claimNext({ workerId: 'broker-c' })
    expect(next.job.reviewId).not.toBe(job.reviewId)
  })

  it('heartbeat מאריך; אסימון שגוי/lease שפג ונתפס מחדש → lease_lost ואין פרסום', async () => {
    const plugin = await makePlugin()
    await queued(plugin, serviceBody())
    const now = new Date()
    const { job } = await claimNext({ workerId: 'a', now })
    const hb = await heartbeat({ reviewId: job.reviewId, token: job.leaseToken, now: new Date(now.getTime() + 20_000) })
    expect(hb.ok).toBe(true)
    expect(hb.leaseExpiresAt.getTime()).toBe(now.getTime() + 20_000 + LEASE_SECONDS * 1000)
    expect(await heartbeat({ reviewId: job.reviewId, token: 'A'.repeat(43) })).toMatchObject({ status: 409, code: 'lease_lost' })
    await allReceipts(job)

    const later = new Date(now.getTime() + 20_000 + LEASE_SECONDS * 1000 + 1)
    const taken = await claimNext({ workerId: 'b', now: later })
    expect(taken.job.reviewId).toBe(job.reviewId)
    expect(taken.job.fence).toBe(2)
    expect(taken.job.receipts).toHaveLength(REQUIRED_RECEIPTS.service.length)
    const late = await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 1, report: 'ok', now: later })
    expect(late).toMatchObject({ ok: false, code: 'lease_lost' })
    expect((await loadPlugin(plugin._id)).isApproved).toBe(false)
    const res = await submitResult({ reviewId: job.reviewId, token: taken.job.leaseToken, digest: job.manifestDigest, decision: 1, report: 'ok', now: later })
    expect(res).toMatchObject({ status: 'approved', published: true })
  })

  it('ביטול בזמן ריצה חוסם פרסום', async () => {
    const plugin = await makePlugin()
    await queued(plugin, serviceBody())
    const { job } = await claimNext({ workerId: 'a' })
    await allReceipts(job)
    const cancelled = await cancelReview({ review: await loadReview(job.reviewId), by: admin._id, asAdmin: true, reason: 'בדיקה' })
    expect(cancelled.ok).toBe(true)
    const res = await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 1, report: 'ok' })
    expect(res.code).toBe('lease_lost')
    const p = await loadPlugin(plugin._id)
    expect(p.isApproved).toBe(false)
    expect(p.serviceState.activeReviewId).toBeNull()
    expect(p.serviceState.currentServiceReview ?? null).toBeNull()
    // הבודק הישן עשוי לרוץ עד שה-lease פג — אין לתפוס בדיקה אחרת לפני כן
    const lock = (await ServiceScanControl.findOne({ key: 'global' }).lean()).lock
    expect(String(lock.reviewId)).toBe(job.reviewId)
    expect(lock.expiresAt.getTime()).toBe(new Date(job.leaseExpiresAt).getTime())
    const other = await makePlugin()
    await queued(other, serviceBody({ assets: [asset({ port: 18097 })] }))
    expect((await claimNext({ workerId: 'b' })).job).toBeNull()
    expect((await claimNext({ workerId: 'b', now: new Date(new Date(job.leaseExpiresAt).getTime() + 1) })).job.pluginId).toBe(String(other._id))
  })

  it('ביטול שנכנס בין שמירת ההחלטה לפרסום: הפרסום נחסם בעדכון המותנה', async () => {
    const plugin = await makePlugin()
    await queued(plugin, serviceBody())
    const { job } = await claimNext({ workerId: 'a' })
    await allReceipts(job)
    // סימולציה של ביטול שהפקיע את נעילת הפרסום בדיוק לפני העדכון ב-Plugin
    await Plugin.updateOne({ _id: plugin._id }, { $inc: { 'serviceState.activeFence': 1 } })
    const res = await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 1, report: 'ok' })
    expect(res).toMatchObject({ ok: true, status: 'needs_operator', published: false })
    expect((await loadReview(job.reviewId)).lastError.code).toBe('publish_conflict')
    expect((await loadPlugin(plugin._id)).isApproved).toBe(false)
  })

  it('קבלות: digest שונה נדחה, data מוגבל, קבלה חסרה → מפעיל → retry', async () => {
    const plugin = await makePlugin()
    await queued(plugin, serviceBody())
    const { job } = await claimNext({ workerId: 'a' })
    expect(await checkpoint({ reviewId: job.reviewId, token: job.leaseToken, stage: 'hashes', digest: 'a'.repeat(64), data: {} })).toMatchObject({ code: 'digest_mismatch' })
    expect(await checkpoint({ reviewId: job.reviewId, token: job.leaseToken, stage: 'bogus', digest: job.manifestDigest })).toMatchObject({ code: 'invalid_stage' })
    expect(await checkpoint({ reviewId: job.reviewId, token: job.leaseToken, stage: 'hashes', digest: job.manifestDigest, data: { x: 'y'.repeat(70_000) } })).toMatchObject({ status: 413 })
    await checkpoint({ reviewId: job.reviewId, token: job.leaseToken, stage: 'hashes', digest: job.manifestDigest, data: { v: 1 } })
    await checkpoint({ reviewId: job.reviewId, token: job.leaseToken, stage: 'hashes', digest: job.manifestDigest, data: { v: 2 } })
    const stored = await loadReview(job.reviewId)
    expect(stored.receipts).toHaveLength(1)
    expect(stored.receipts[0].data).toEqual({ v: 2 })
    expect(await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: 'b'.repeat(64), decision: 1, report: 'ok' })).toMatchObject({ code: 'digest_mismatch' })
    expect(await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 2, report: 'ok' })).toMatchObject({ status: 400 })
    const res = await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 1, report: 'ok' })
    expect(res.status).toBe('needs_operator')
    const review = await loadReview(job.reviewId)
    expect(review.decision).toBe(1)
    expect(review.lastError.code).toBe('receipts_incomplete')
    expect((await adminRetry({ review })).status).toBe('queued')
    const again = await claimNext({ workerId: 'a' })
    expect(again.job.receipts.map((r) => r.stage)).toEqual(['hashes'])
  })

  it('כשלים: זמני ×2 ואז מפעיל; מכסה משהה את כל התור עם Retry-After', async () => {
    const plugin = await makePlugin()
    const other2 = await makePlugin()
    await queued(plugin, serviceBody())
    const t = new Date()
    let { job } = await claimNext({ workerId: 'a', now: t })
    let r = await reportFailure({ reviewId: job.reviewId, token: job.leaseToken, failureClass: 'transient', code: 'claude_stalled', now: t })
    expect(r).toMatchObject({ status: 'retry_wait', nextAttemptAt: new Date(t.getTime() + 60_000) })
    expect((await claimNext({ workerId: 'a', now: t })).job).toBeNull()
    ;({ job } = await claimNext({ workerId: 'a', now: new Date(t.getTime() + 60_000) }))
    r = await reportFailure({ reviewId: job.reviewId, token: job.leaseToken, failureClass: 'transient', code: 'x', now: t })
    expect(r.nextAttemptAt.getTime()).toBe(t.getTime() + 300_000)
    ;({ job } = await claimNext({ workerId: 'a', now: new Date(t.getTime() + 300_000) }))
    r = await reportFailure({ reviewId: job.reviewId, token: job.leaseToken, failureClass: 'transient', code: 'x', now: t })
    expect(r.status).toBe('needs_operator')
    await adminRetry({ review: await loadReview(job.reviewId) })

    await queued(other2, serviceBody({ assets: [asset({ port: 18095 })] }))
    ;({ job } = await claimNext({ workerId: 'a', now: t }))
    const resetAt = new Date(t.getTime() + 3600_000)
    r = await reportFailure({ reviewId: job.reviewId, token: job.leaseToken, failureClass: 'quota', code: 'rate_limit', resetAt: resetAt.toISOString(), now: t })
    expect(r).toMatchObject({ status: 'waiting_quota', nextAttemptAt: new Date(resetAt.getTime() + 60_000) })
    const paused = await claimNext({ workerId: 'a', now: t })
    expect(paused.job).toBeNull()
    expect(paused.retryAfter).toBe(3660)
    const resumed = await claimNext({ workerId: 'a', now: new Date(resetAt.getTime() + 60_000) })
    expect(resumed.job).toBeTruthy()
    r = await reportFailure({ reviewId: resumed.job.reviewId, token: resumed.job.leaseToken, failureClass: 'operator', code: 'auth', now: t })
    expect(r.status).toBe('needs_operator')
  })
})

describe('פרסום, עדכון תוסף, חזרה לאחור וניקוי', () => {
  it('פרסום שירות → עדכון תוסף → שירות חדש → חזרה לאחור', async () => {
    const plugin = await makePlugin()
    const s1 = await approve(plugin, serviceBody())
    let p = await loadPlugin(plugin._id)
    expect(p).toMatchObject({ isApproved: true, version: '1.0.0', compatibleWith: '0.9.60', requiresNetwork: true, pluginFileSize: 5, pluginFileName: `${plugin.slug}-1.0.0.otzplugin` })
    expect(p.pluginFileSha256).toBe(s1.pluginAsset.sha256)
    expect(String(p.serviceState.currentServiceReview)).toBe(String(s1._id))
    expect(String(p.serviceState.currentPluginReview)).toBe(String(s1._id))
    expect(p.serviceState.previousServiceReview).toBeNull()
    expect(p.serviceState.activeReviewId).toBeNull()
    expect(p.serviceState.ports).toEqual([{ os: 'windows', port: 18090 }])
    expect(p.serviceState.platforms[0]).toMatchObject({ os: 'windows', fileKey: 'native0', name: 'setup.exe', sha256: s1.assets[0].sha256 })
    expect(p.serviceState.publishedServiceVersions).toEqual(['1.0.0'])
    expect(p.versions).toEqual([])
    expect(s1.status).toBe('approved')
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: 'dev@example.org', version: '1.0.0' }))
    expect(mocks.revalidate).toHaveBeenCalledWith('plugins-public')

    const p1 = await approve(plugin, pluginBody())
    p = await loadPlugin(plugin._id)
    expect(p.version).toBe('1.1.0')
    expect(p.pluginFileName).toBe(`${plugin.slug}-1.1.0.otzplugin`)
    expect(p.versions[0].pluginFileName).toBe(`${plugin.slug}-1.0.0.otzplugin`)
    expect(String(p.serviceState.currentPluginReview)).toBe(String(p1._id))
    expect(String(p.serviceState.currentServiceReview)).toBe(String(s1._id))
    expect(p.versions.map((v) => [v.version, String(v.reviewId)])).toEqual([['1.0.0', String(s1._id)]])
    expect(p.serviceState.publishedPluginVersions).toEqual(['1.0.0', '1.1.0'])
    const p1Claimed = (await ServicePluginReview.findById(p1._id).lean())
    expect(String(p1Claimed.baseCurrentPluginReview)).toBe(String(s1._id))

    await Plugin.updateOne({ _id: plugin._id }, { $set: { 'serviceState.lastServiceCycleStartedAt': new Date(Date.now() - 22 * DAY) } })
    const s2 = await approve(plugin, serviceBody({ pluginVersion: '1.2.0', serviceVersion: '1.1.0' }))
    p = await loadPlugin(plugin._id)
    expect(String(p.serviceState.previousServiceReview)).toBe(String(s1._id))
    expect(String(p.serviceState.currentServiceReview)).toBe(String(s2._id))
    expect(p.versions.map((v) => v.version)).toEqual(['1.0.0', '1.1.0'])
    expect(await maintenanceKeepList()).toEqual([{ pluginId: String(plugin._id), reviewIds: [String(s2._id), String(s1._id)] }])

    const back = await rollback({ plugin: p })
    expect(back.ok).toBe(true)
    p = await loadPlugin(plugin._id)
    expect(p.version).toBe('1.0.0')
    expect(p.pluginFileName).toBe(`${plugin.slug}-1.0.0.otzplugin`)
    expect(p.serviceState.serviceVersion).toBe('1.0.0')
    expect(String(p.serviceState.currentServiceReview)).toBe(String(s1._id))
    expect(String(p.serviceState.currentPluginReview)).toBe(String(s1._id))
    expect(p.serviceState.previousServiceReview).toBeNull()
    expect(p.versions.map((v) => v.version)).toEqual(['1.1.0', '1.2.0'])
    expect(p.serviceState.publishedServiceVersions).toEqual(['1.0.0', '1.1.0'])
    expect((await rollback({ plugin: p })).code).toBe('no_previous')
    // מספרי גרסה שפורסמו אינם חוזרים גם אחרי חזרה לאחור
    const reuse = await createDraft({ plugin: p, user: owner, body: pluginBody({ pluginVersion: '1.2.0' }) })
    expect(reuse.errors.join()).toMatch(/כבר פורסמה/)

    // ניקוי: s2 אינו נוכחי/קודם → המתקינים שלו נמחקים, קובץ התוסף נשמר
    const summary = await runServicePluginCleanup(new Date())
    expect(summary.deletedNativeFiles).toBe(1)
    expect(await readdir(path.join(storageDir, String(s2._id)))).toEqual(['plugin'])
    expect((await loadReview(s2._id)).nativeFilesDeletedAt).toBeTruthy()
    expect((await readdir(path.join(storageDir, String(s1._id)))).sort()).toEqual(['native0', 'plugin'])
  })

  it('תוסף מוסתר אינו מתפרסם; שחזור פרסום שנקטע (finalizeIfPublished)', async () => {
    const plugin = await makePlugin()
    await queued(plugin, serviceBody())
    const { job } = await claimNext({ workerId: 'a' })
    await allReceipts(job)
    await Plugin.updateOne({ _id: plugin._id }, { $set: { isHidden: true } })
    const res = await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 1, report: 'ok' })
    expect(res.status).toBe('needs_operator')
    expect((await loadPlugin(plugin._id)).isApproved).toBe(false)

    // הפרסום עבר אך כתיבת הסטטוס "נכשלה": ההגשה נשארה needs_operator עם החלטה 1
    await Plugin.updateOne({ _id: plugin._id }, { $set: { isHidden: false, 'serviceState.currentPluginReview': job.reviewId, 'serviceState.activeReviewId': null } })
    const fin = await finalizeIfPublished(await loadReview(job.reviewId))
    expect(fin).toEqual({ published: true, finalized: true })
    expect((await loadReview(job.reviewId)).status).toBe('approved')
  })

  it('ניקוי: טיוטה ישנה מבוטלת, קבצי הגשה שבוטלה לפני 7 ימים נמחקים, תקועה בהקפאה חוזרת לטיוטה', async () => {
    const plugin = await makePlugin()
    const created = await createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody() })
    await upload(await loadReview(created.review._id), 'plugin', 5)
    const now = new Date(Date.now() + 2 * DAY)
    let summary = await runServicePluginCleanup(now)
    expect(summary.expiredDrafts).toBe(1)
    expect((await loadReview(created.review._id)).status).toBe('cancelled')
    expect((await loadPlugin(plugin._id)).serviceState.activeReviewId).toBeNull()
    // ביטול לפני התור מוחק את הקבצים מיד; סבב 7 הימים לא מוצא מה למחוק
    await expect(readdir(path.join(storageDir, String(created.review._id)))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await loadReview(created.review._id)).filesDeletedAt).toBeTruthy()
    summary = await runServicePluginCleanup(new Date(Date.now() + 9 * DAY))
    expect(summary.deletedReviewFiles).toBe(0)

    const p2 = await makePlugin()
    const c2 = await createDraft({ plugin: await loadPlugin(p2._id), user: owner, body: serviceBody({ assets: [asset({ port: 18099 })] }) })
    await ServicePluginReview.collection.updateOne({ _id: c2.review._id }, { $set: { status: 'sealing', updatedAt: new Date(Date.now() - 2 * 3600_000) } })
    summary = await runServicePluginCleanup(new Date())
    expect(summary.unstuckSealing).toBe(1)
    expect((await loadReview(c2.review._id)).status).toBe('draft')
  })

  it('קובץ למתווך רק עם lease בתוקף', async () => {
    const plugin = await makePlugin()
    await queued(plugin, serviceBody())
    const { job } = await claimNext({ workerId: 'a' })
    const opened = await openWorkerAsset({ reviewId: job.reviewId, token: job.leaseToken, key: 'native0' })
    expect(opened).toMatchObject({ ok: true, size: 6, sha256: job.assets[0].sha256 })
    expect(Buffer.from(await new Response(opened.stream).arrayBuffer()).toString()).toBe('nnnnnn')
    expect(await openWorkerAsset({ reviewId: job.reviewId, token: 'B'.repeat(43), key: 'plugin' })).toMatchObject({ code: 'lease_lost' })
    expect(await openWorkerAsset({ reviewId: job.reviewId, token: job.leaseToken, key: 'native5' })).toMatchObject({ status: 404 })
  })
})

describe('תיקוני QA', () => {
  it('ביטול לפני התור (בעלים/מנהל) מוחק את הקבצים מיד ומסמן filesDeletedAt', async () => {
    const plugin = await makePlugin()
    const created = await createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody() })
    await upload(await loadReview(created.review._id), 'plugin', 5)
    expect((await cancelReview({ review: await loadReview(created.review._id), by: owner._id })).ok).toBe(true)
    await expect(readdir(path.join(storageDir, String(created.review._id)))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await loadReview(created.review._id)).filesDeletedAt).toBeTruthy()

    const pending = await sealed(plugin, serviceBody())
    expect((await cancelReview({ review: pending, by: admin._id, asAdmin: true })).ok).toBe(true)
    await expect(readdir(path.join(storageDir, String(pending._id)))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await loadReview(pending._id)).filesDeletedAt).toBeTruthy()
  })

  it('הגשה שממתינה למנהל יותר מ-30 יום מבוטלת בניקוי: קבצים נמחקים והנעילה משתחררת', async () => {
    const plugin = await makePlugin()
    const review = await sealed(plugin, serviceBody())
    expect((await runServicePluginCleanup(new Date(Date.now() + 29 * DAY))).expiredPending).toBe(0)
    const summary = await runServicePluginCleanup(new Date(Date.now() + 31 * DAY))
    expect(summary.expiredPending).toBe(1)
    const stored = await loadReview(review._id)
    expect(stored).toMatchObject({ status: 'cancelled', cancelReason: 'ההגשה לא נבחרה לבדיקה תוך 30 יום' })
    expect(stored.filesDeletedAt).toBeTruthy()
    await expect(readdir(path.join(storageDir, String(review._id)))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await loadPlugin(plugin._id)).serviceState.activeReviewId).toBeNull()
  })

  it('ביטול מול פרסום עם עותק ישן (בלי decision): 409 already_published וההגשה מסומנת מאושרת', async () => {
    const plugin = await makePlugin()
    await queued(plugin, serviceBody())
    const { job } = await claimNext({ workerId: 'a' })
    await allReceipts(job)
    const stale = await loadReview(job.reviewId)
    expect(stale.decision).toBeNull()
    await submitResult({ reviewId: job.reviewId, token: job.leaseToken, digest: job.manifestDigest, decision: 1, report: 'ok' })
    // המצביע ב-Plugin עודכן אך כתיבת הסטטוס "נכשלה"
    await ServicePluginReview.updateOne({ _id: job.reviewId }, { $set: { status: 'running', activeKey: String(plugin._id) } })
    const res = await cancelReview({ review: stale, by: admin._id, asAdmin: true })
    expect(res).toMatchObject({ ok: false, status: 409, code: 'already_published' })
    expect((await loadReview(job.reviewId)).status).toBe('approved')
  })

  it('נעילה יתומה (הגשה סופית או חסרה) משתחררת בניקוי רק אחרי 10 דקות', async () => {
    const plugin = await makePlugin()
    const created = await createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody() })
    await ServicePluginReview.updateOne({ _id: created.review._id }, { $set: { status: 'rejected', activeKey: null } })
    const missing = await makePlugin({ serviceState: { activeReviewId: new ServicePluginReview()._id } })
    expect((await runServicePluginCleanup(new Date())).releasedLocks).toBe(0)
    const later = new Date(Date.now() + 11 * 60_000)
    expect((await runServicePluginCleanup(later)).releasedLocks).toBe(2)
    expect((await loadPlugin(plugin._id)).serviceState.activeReviewId).toBeNull()
    expect((await loadPlugin(missing._id)).serviceState.activeReviewId).toBeNull()

    // הגשה פעילה אינה נוגעת
    const live = await createDraft({ plugin: await loadPlugin(plugin._id), user: owner, body: serviceBody() })
    await runServicePluginCleanup(new Date(Date.now() + 11 * 60_000))
    expect(String((await loadPlugin(plugin._id)).serviceState.activeReviewId)).toBe(String(live.review._id))
  })

  it('approvedAt נקבע בפרסום ראשון גם כשהשדה null (אחרי ביטול אישור ותיק)', async () => {
    const plugin = await makePlugin({ approvedAt: null })
    expect((await loadPlugin(plugin._id)).approvedAt).toBeNull()
    await approve(plugin, serviceBody())
    const p = await loadPlugin(plugin._id)
    expect(p.approvedAt).toBeInstanceOf(Date)
    expect(String(p.approvedBy)).toBe(String(admin._id))
  })

  it('קבלות מקבילות של שלבים שונים נשמרות שתיהן', async () => {
    const plugin = await makePlugin()
    await queued(plugin, serviceBody())
    const { job } = await claimNext({ workerId: 'a' })
    const stages = ['hashes', 'clamav', 'release', 'extract']
    const results = await Promise.all(stages.map((stage) =>
      checkpoint({ reviewId: job.reviewId, token: job.leaseToken, stage, digest: job.manifestDigest, data: { stage, $odd: 'x' } })))
    expect(results.every((r) => r.ok)).toBe(true)
    const stored = await loadReview(job.reviewId)
    expect(stored.receipts.map((r) => r.stage).sort()).toEqual([...stages].sort())
    expect(stored.receipts.find((r) => r.stage === 'clamav').data).toEqual({ stage: 'clamav', $odd: 'x' })
  })

  it('תוסף מוסתר/מושהה: אין טיוטה חדשה, וההגשה שבתור לא נתפסת עד החזרתו', async () => {
    const hidden = await makePlugin({ isHidden: true })
    expect(await createDraft({ plugin: await loadPlugin(hidden._id), user: owner, body: serviceBody() }))
      .toMatchObject({ ok: false, status: 409, code: 'plugin_unavailable' })

    const plugin = await makePlugin()
    const review = await queued(plugin, serviceBody())
    await Plugin.updateOne({ _id: plugin._id }, { $set: { isSuspended: true } })
    expect((await claimNext({ workerId: 'a' })).job).toBeNull()
    expect((await loadReview(review._id)).status).toBe('queued')
    expect((await ServiceScanControl.findOne({ key: 'global' }).lean()).lock).toBeNull()
    await Plugin.updateOne({ _id: plugin._id }, { $set: { isSuspended: false } })
    expect((await claimNext({ workerId: 'a' })).job.reviewId).toBe(String(review._id))
  })

  it('חריגת מנהל נצרכת בהתחלת בדיקת השירות הבאה גם כשלא הייתה נחוצה', async () => {
    const plugin = await makePlugin()
    expect((await adminEmergency({ plugin: await loadPlugin(plugin._id), admin, reason: 'מראש' })).ok).toBe(true)
    const review = await sealed(plugin, serviceBody())
    const res = await adminStart({ plugin: await loadPlugin(plugin._id), review, admin })
    expect(res).toMatchObject({ ok: true, exceptionUsed: true })
    expect((await loadPlugin(plugin._id)).serviceState.adminException).toBeNull()
    expect((await loadReview(review._id)).exceptionUsed.reason).toBe('מראש')
  })

  it('פקיעות lease חוזרות → מפעיל (lease_expired_repeatedly); ניסיון חוזר מאפס את המונה', async () => {
    const plugin = await makePlugin()
    const review = await queued(plugin, serviceBody())
    let now = new Date()
    let { job } = await claimNext({ workerId: 'a', now })
    for (let expiry = 1; expiry <= 4; expiry++) {
      now = new Date(new Date(job.leaseExpiresAt).getTime() + 1)
      ;({ job } = await claimNext({ workerId: 'a', now }))
      expect(job.reviewId).toBe(String(review._id))
      expect((await loadReview(review._id)).leaseExpiries).toBe(expiry)
    }
    now = new Date(new Date(job.leaseExpiresAt).getTime() + 1)
    expect((await claimNext({ workerId: 'a', now })).job).toBeNull()
    const stored = await loadReview(review._id)
    expect(stored).toMatchObject({ status: 'needs_operator', leaseExpiries: 5, attempts: 0 })
    expect(stored.lastError).toMatchObject({ class: 'operator', code: 'lease_expired_repeatedly' })
    expect((await ServiceScanControl.findOne({ key: 'global' }).lean()).lock).toBeNull()

    await adminRetry({ review: stored })
    expect((await loadReview(review._id)).leaseExpiries).toBe(0)
    expect((await claimNext({ workerId: 'a', now })).job.reviewId).toBe(String(review._id))
  })
})


describe('תיקוני הסקירה: התאוששות ושריון פורטים', () => {
  it('משלים הכנסה לתור אחרי כשל כתיבה, עם מועד וחריגה מקוריים', async () => {
    const plugin = await makePlugin()
    await adminEmergency({ plugin: await loadPlugin(plugin._id), admin, reason: 'תיקון דחוף' })
    const review = await sealed(plugin, serviceBody())
    const startedAt = new Date()
    const spy = vi.spyOn(ServicePluginReview, 'updateOne').mockRejectedValueOnce(new Error('כשל כתיבה מדומה'))
    try {
      await expect(adminStart({ plugin: await loadPlugin(plugin._id), review, admin, now: startedAt })).rejects.toThrow('כשל כתיבה מדומה')
    } finally { spy.mockRestore() }
    expect((await loadReview(review._id)).status).toBe('pending_admin')
    expect((await getAdminView()).reviews.find((r) => r.id === String(review._id)).cooldown.blocked).toBe(false)
    // גם חריגה חדשה שניתנה בין הבקשות אינה נצרכת בהשלמת הפעולה המקורית.
    await adminEmergency({ plugin: await loadPlugin(plugin._id), admin, reason: 'החריגה הבאה' })
    const later = new Date(startedAt.getTime() + DAY)
    expect(await adminStart({ plugin: await loadPlugin(plugin._id), review: await loadReview(review._id), admin: other, now: later }))
      .toMatchObject({ ok: true, exceptionUsed: true })
    const stored = await loadReview(review._id)
    expect(stored.selectedAt).toEqual(startedAt)
    expect(String(stored.selectedBy)).toBe(String(admin._id))
    expect(stored.exceptionUsed.reason).toBe('תיקון דחוף')
    const state = (await loadPlugin(plugin._id)).serviceState
    expect(state.lastServiceCycleStartedAt).toEqual(startedAt)
    expect(state.adminException.reason).toBe('החריגה הבאה')
  })

  it('שתי התחלויות מקבילות שומרות את אותה בחירה ומכניסות עבודה אחת לתור', async () => {
    const plugin = await makePlugin()
    const review = await sealed(plugin, serviceBody())
    const snapshot = await loadPlugin(plugin._id)
    const results = await Promise.all([adminStart({ plugin: snapshot, review, admin }), adminStart({ plugin: snapshot, review, admin: other })])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect((await loadReview(review._id)).status).toBe('queued')
  })

  it('טיוטה שמעוכבת לפני ההוספה כבר מחזיקה בפורט; ביטול משחרר אותו', async () => {
    const a = await makePlugin()
    const b = await makePlugin()
    const realCreate = ServicePluginReview.create.bind(ServicePluginReview)
    let releaseFirst, firstReached
    const hold = new Promise((resolve) => { releaseFirst = resolve })
    const reached = new Promise((resolve) => { firstReached = resolve })
    const spy = vi.spyOn(ServicePluginReview, 'create').mockImplementationOnce(async (...args) => {
      firstReached()
      await hold
      return realCreate(...args)
    })
    let first
    try {
      first = createDraft({ plugin: await loadPlugin(a._id), user: owner, body: serviceBody() })
      await reached
      expect(await createDraft({ plugin: await loadPlugin(b._id), user: owner, body: serviceBody() })).toMatchObject({ ok: false, code: 'port_taken' })
    } finally { releaseFirst(); spy.mockRestore() }
    const winner = await first
    expect(winner.ok).toBe(true)
    await cancelReview({ review: await loadReview(winner.review._id), by: owner._id })
    expect((await createDraft({ plugin: await loadPlugin(b._id), user: owner, body: serviceBody() })).ok).toBe(true)
  })

  it('האינדקס עוצר שתי שמירות גם כשבדיקות ההקדמה נעשו לפני שתיהן', async () => {
    const plugins = await Promise.all([makePlugin(), makePlugin()])
    // כתיבות ישירות ל-DB מאמתות את הערבות האטומית, בלי להסתמך על בדיקת הקיום.
    const results = await Promise.allSettled(plugins.map((p) => Plugin.updateOne({ _id: p._id },
      { $addToSet: { 'serviceState.reservedPortKeys': 'windows:18090' } })))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find((r) => r.status === 'rejected').reason.code).toBe(11000)
  })

  it('הפורט של השירות הקודם נשמר עד פרסום גרסה שלישית; חזרה לאחור בטוחה', async () => {
    const a = await makePlugin()
    await approve(a, serviceBody())
    const next = async (version, port) => {
      await Plugin.updateOne({ _id: a._id }, { $set: { 'serviceState.lastServiceCycleStartedAt': new Date(Date.now() - 22 * DAY) } })
      await approve(a, serviceBody({ pluginVersion: version, serviceVersion: version, assets: [asset({ port })] }))
    }
    await next('2.0.0', 18091)
    const b = await makePlugin()
    expect(await createDraft({ plugin: await loadPlugin(b._id), user: owner, body: serviceBody() })).toMatchObject({ code: 'port_taken' })
    await next('3.0.0', 18092)
    const reserved = (await loadPlugin(a._id)).serviceState.reservedPortKeys
    expect(reserved).toEqual(['windows:18091', 'windows:18092'])
    expect((await createDraft({ plugin: await loadPlugin(b._id), user: owner, body: serviceBody() })).ok).toBe(true)
    expect((await rollback({ plugin: await loadPlugin(a._id) })).ok).toBe(true)
    expect((await loadPlugin(a._id)).serviceState.reservedPortKeys).toEqual(['windows:18091'])
  })

  it('כשל ביצירת ההגשה משחרר את השריון והנעילה', async () => {
    const a = await makePlugin()
    const spy = vi.spyOn(ServicePluginReview, 'create').mockRejectedValueOnce(new Error('כשל הוספה'))
    try { await expect(createDraft({ plugin: await loadPlugin(a._id), user: owner, body: serviceBody() })).rejects.toThrow('כשל הוספה') }
    finally { spy.mockRestore() }
    expect((await loadPlugin(a._id)).serviceState.reservedPortKeys).toEqual([])
    const b = await makePlugin()
    expect((await createDraft({ plugin: await loadPlugin(b._id), user: owner, body: serviceBody() })).ok).toBe(true)
  })
})
