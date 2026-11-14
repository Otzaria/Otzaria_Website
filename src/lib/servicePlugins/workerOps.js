// צד המתווך: תפיסה עם נעילה גלובלית אחת, lease+fence, קבלות שלבים, כשלים ותוצאה.
// כל כתיבה להגשה מותנית ב-lease בתוקף ובאותו fence; אובדן lease חוסם פרסום מאוחר.
import Plugin from '../../models/Plugin.js'
import ServicePluginReview from '../../models/ServicePluginReview.js'
import ServiceScanControl from '../../models/ServiceScanControl.js'
import { createSystemMessage } from '../systemMessages.js'
import {
  LEASE_SECONDS, LIMITS, RECEIPT_STAGES, FAILURE_CLASSES, nextAfterTransientFailure, nextAfterQuota,
  validateDecision, missingReceipts,
} from './policy.js'
import { newLeaseToken, hashLeaseToken, isLeaseTokenShape } from './workerAuth.js'
import { publishReview, finalizeIfPublished, releaseScanLock, CLEARED_LEASE } from './publish.js'
import { syncPortReservations } from './ports.js'
import { openReviewAssetStream } from './storage.js'

const fail = (status, code, more = {}) => ({ ok: false, status, code, ...more })
const leaseLost = () => fail(409, 'lease_lost')
const isId = (v) => typeof v === 'string' && /^[a-f0-9]{24}$/.test(v)
const leaseUntil = (now) => new Date(now.getTime() + LEASE_SECONDS * 1000)
const CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/
const MAX_LEASE_EXPIRIES = 5

async function ensureControl() {
  try {
    await ServiceScanControl.updateOne({ key: 'global' }, { $setOnInsert: { key: 'global', lock: null, quotaPausedUntil: null } }, { upsert: true })
  } catch (err) {
    if (err?.code !== 11000) throw err
  }
}

/**
 * תפיסת ההגשה הבאה: נעילה גלובלית (פנויה/פגה ואין השהיית מכסה) → הגשה בתור/שזמנה הגיע/שה-lease שלה פג.
 * @returns {Promise<{ok:true, job:object|null, retryAfter?:number}>}
 */
export async function claimNext({ workerId, now = new Date() }) {
  const owner = String(workerId || 'broker').slice(0, 200)
  await ensureControl()
  const expiresAt = leaseUntil(now)
  const control = await ServiceScanControl.findOneAndUpdate(
    {
      key: 'global',
      $and: [
        { $or: [{ lock: null }, { 'lock.expiresAt': { $lte: now } }] },
        { $or: [{ quotaPausedUntil: null }, { quotaPausedUntil: { $lte: now } }] },
      ],
    },
    { $set: { lock: { reviewId: null, owner, expiresAt } } },
    { returnDocument: 'after' },
  ).lean()
  if (!control) {
    const current = await ServiceScanControl.findOne({ key: 'global' }).lean()
    const pausedUntil = current?.quotaPausedUntil
    const retryAfter = pausedUntil && pausedUntil > now ? Math.ceil((pausedUntil.getTime() - now.getTime()) / 1000) : undefined
    return { ok: true, job: null, ...(retryAfter ? { retryAfter } : {}) }
  }

  const releaseClaimLock = () =>
    ServiceScanControl.updateOne({ key: 'global', 'lock.owner': owner, 'lock.reviewId': null, 'lock.expiresAt': expiresAt }, { $set: { lock: null } })

  // הגשה של תוסף מוסתר/מושהה נשארת בתור: פרסומה ממילא ייחסם, ואין טעם לצרוך עליה סקירה
  const unavailable = await Plugin.distinct('_id', { hasService: true, $or: [{ isHidden: true }, { isSuspended: true }] })
  const token = newLeaseToken()
  const lease = { owner, tokenHash: hashLeaseToken(token), expiresAt }
  const review = await ServicePluginReview.findOneAndUpdate(
    {
      pluginId: { $nin: unavailable },
      $or: [
        { status: 'queued' },
        { status: { $in: ['retry_wait', 'waiting_quota'] }, nextAttemptAt: { $lte: now } },
        { status: 'running', 'lease.expiresAt': { $lte: now } },
      ],
    },
    [{
      $set: {
        leaseExpiries: { $add: [{ $ifNull: ['$leaseExpiries', 0] }, { $cond: [{ $eq: ['$status', 'running'] }, 1, 0] }] },
        status: 'running',
        lease: { $literal: lease },
        nextAttemptAt: null,
        fence: { $add: [{ $ifNull: ['$fence', 0] }, 1] },
      },
    }],
    { sort: { selectedAt: 1, _id: 1 }, returnDocument: 'after', updatePipeline: true },
  ).lean()
  if (!review) {
    await releaseClaimLock()
    return { ok: true, job: null }
  }
  if (review.leaseExpiries >= MAX_LEASE_EXPIRIES) {
    await ServicePluginReview.updateOne({ _id: review._id, status: 'running', fence: review.fence }, {
      $set: {
        status: 'needs_operator', nextAttemptAt: null, lease: CLEARED_LEASE,
        lastError: { class: 'operator', code: 'lease_expired_repeatedly', message: 'הבודק איבד שוב ושוב את ההרשאה לבדיקה זו (קריסה או ניתוק חוזרים); נדרש טיפול של אחראי השרת', at: now },
      },
    })
    await releaseClaimLock()
    return { ok: true, job: null }
  }
  await ServiceScanControl.updateOne({ key: 'global', 'lock.owner': owner, 'lock.reviewId': null, 'lock.expiresAt': expiresAt }, { $set: { 'lock.reviewId': review._id } })
  await Plugin.updateOne({ _id: review.pluginId, 'serviceState.activeReviewId': review._id }, { $set: { 'serviceState.activeFence': review.fence } })
  return { ok: true, job: await buildJob(review, token) }
}

const sourcesOf = (r) => (r.sources || []).map((s) => ({ repository: s.repository, commit: s.commit }))

async function buildJob(review, token) {
  const plugin = await Plugin.findById(review.pluginId).select('pluginUid serviceState').lean()
  const s = plugin?.serviceState || {}
  const baseId = s.currentPluginReview && String(s.currentPluginReview) !== String(review._id) ? s.currentPluginReview : null
  const previous = baseId
    ? await ServicePluginReview.findById(baseId).select('kind sources pluginVersion serviceVersion').lean()
    : await ServicePluginReview.findOne({ pluginId: review.pluginId, status: 'approved', _id: { $ne: review._id } })
      .sort({ publishedAt: -1 }).select('kind sources pluginVersion serviceVersion').lean()
  const service = review.kind === 'plugin' && s.currentServiceReview
    ? await ServicePluginReview.findById(s.currentServiceReview).select('serviceVersion serviceRange sources').lean()
    : null
  return {
    reviewId: String(review._id),
    leaseToken: token,
    leaseExpiresAt: review.lease.expiresAt,
    fence: review.fence,
    kind: review.kind,
    pluginId: String(review.pluginId),
    pluginUid: plugin?.pluginUid ?? null,
    manifestDigest: review.manifestDigest,
    policyVersion: review.policyVersion,
    attempts: review.attempts || 0,
    submission: {
      pluginVersion: review.pluginVersion,
      serviceVersion: review.serviceVersion ?? null,
      serviceRange: { min: review.serviceRange?.min ?? null, max: review.serviceRange?.max ?? null },
      sources: sourcesOf(review),
      uninstall: review.uninstall ?? null,
      virusTotalConsent: review.virusTotalConsent === true,
      changeNotes: review.changeNotes || '',
      manifest: review.manifest ?? null,
    },
    plugin: { size: review.pluginAsset?.size ?? null, sha256: review.pluginAsset?.sha256 ?? null },
    assets: (review.assets || []).map((a) => ({
      key: a.key, name: a.name, size: a.size, sha256: a.sha256, os: a.os, arch: a.arch, minOs: a.minOs, port: a.port,
      bundledPluginPath: a.bundledPluginPath, releaseUrl: a.releaseUrl,
    })),
    previousApproved: previous
      ? { reviewId: String(previous._id), kind: previous.kind, sources: sourcesOf(previous), pluginVersion: previous.pluginVersion, serviceVersion: previous.serviceVersion ?? null }
      : null,
    approvedService: service
      ? { reviewId: String(service._id), serviceVersion: service.serviceVersion, serviceRange: { min: service.serviceRange?.min ?? null, max: service.serviceRange?.max ?? null }, sources: sourcesOf(service) }
      : null,
    receipts: (review.receipts || []).map((r) => ({ stage: r.stage, digest: r.digest, at: r.at, data: r.data ?? null })),
  }
}

async function loadLeased(reviewId, token, now) {
  if (!isId(String(reviewId ?? '')) || !isLeaseTokenShape(token)) return leaseLost()
  const review = await ServicePluginReview.findOne({
    _id: reviewId, status: 'running', 'lease.tokenHash': hashLeaseToken(token), 'lease.expiresAt': { $gt: now },
  }).lean()
  return review ? { ok: true, review } : leaseLost()
}

const leaseFilter = (review, now) => ({
  _id: review._id, status: 'running', fence: review.fence, 'lease.tokenHash': review.lease.tokenHash, 'lease.expiresAt': { $gt: now },
})

export async function heartbeat({ reviewId, token, now = new Date() }) {
  const loaded = await loadLeased(reviewId, token, now)
  if (!loaded.ok) return loaded
  const { review } = loaded
  const expiresAt = leaseUntil(now)
  const res = await ServicePluginReview.updateOne(leaseFilter(review, now), { $set: { 'lease.expiresAt': expiresAt } })
  if (res.matchedCount !== 1) return leaseLost()
  const lock = await ServiceScanControl.updateOne(
    { key: 'global', $or: [{ 'lock.reviewId': review._id }, { lock: null }, { 'lock.expiresAt': { $lte: now } }] },
    { $set: { lock: { reviewId: review._id, owner: review.lease.owner, expiresAt } } },
  )
  if (lock.matchedCount !== 1) return leaseLost()
  return { ok: true, leaseExpiresAt: expiresAt }
}

/** קבלת שלב (מחליפה קבלה קודמת של אותו שלב). */
export async function checkpoint({ reviewId, token, stage, digest, data, now = new Date() }) {
  if (!RECEIPT_STAGES.includes(stage)) return fail(400, 'invalid_stage')
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) return fail(400, 'invalid_digest')
  let size
  try {
    size = Buffer.byteLength(JSON.stringify(data ?? null), 'utf8')
  } catch {
    return fail(400, 'invalid_data')
  }
  // קבלת claude כוללת את הדוח (עד reportBytes) ועוד מטא-דאטה, ולכן תקרתה גבוהה יותר
  const maxBytes = stage === 'claude' ? 2 * LIMITS.reportBytes + 8 * 1024 : LIMITS.reportBytes
  if (size > maxBytes) return fail(413, 'data_too_large')
  const loaded = await loadLeased(reviewId, token, now)
  if (!loaded.ok) return loaded
  const { review } = loaded
  if (digest !== review.manifestDigest) return fail(409, 'digest_mismatch')
  // החלפה אטומית בצד המסד: שתי קבלות מקבילות לא ידרסו זו את זו
  const receipt = { stage, digest, at: now, data: data ?? null }
  const res = await ServicePluginReview.updateOne(leaseFilter(review, now), [{
    $set: {
      receipts: {
        $concatArrays: [
          { $filter: { input: { $ifNull: ['$receipts', []] }, cond: { $ne: ['$$this.stage', stage] } } },
          { $literal: [receipt] },
        ],
      },
    },
  }], { updatePipeline: true })
  if (res.matchedCount !== 1) return leaseLost()
  return { ok: true }
}

/** כשל: זמני → ניסיון חוזר מתוזמן; מכסה → השהיה משותפת לכל תור Claude; תפעולי → מפעיל. */
export async function reportFailure({ reviewId, token, failureClass, code, message, resetAt, now = new Date() }) {
  if (!FAILURE_CLASSES.includes(failureClass)) return fail(400, 'invalid_class')
  if (typeof code !== 'string' || !CODE_RE.test(code)) return fail(400, 'invalid_code')
  if (message !== undefined && message !== null && typeof message !== 'string') return fail(400, 'invalid_message')
  const loaded = await loadLeased(reviewId, token, now)
  if (!loaded.ok) return loaded
  const { review } = loaded

  let next
  const set = {}
  if (failureClass === 'transient') {
    const attempts = (review.attempts || 0) + 1
    next = nextAfterTransientFailure(attempts, now)
    set.attempts = attempts
  } else if (failureClass === 'quota') {
    next = nextAfterQuota({ resetAt, unknownWaits: review.unknownQuotaWaits || 0, now })
    if (next.unknownWaits !== undefined) set.unknownQuotaWaits = next.unknownWaits
  } else {
    next = { status: 'needs_operator' }
  }
  Object.assign(set, {
    status: next.status,
    nextAttemptAt: next.nextAttemptAt ?? null,
    lease: CLEARED_LEASE,
    lastError: { class: failureClass, code, message: (message || '').slice(0, LIMITS.reasonChars), at: now },
  })
  const res = await ServicePluginReview.updateOne(leaseFilter(review, now), { $set: set })
  if (res.matchedCount !== 1) return leaseLost()
  await releaseScanLock(review._id)
  if (failureClass === 'quota' && next.status === 'waiting_quota') {
    await ServiceScanControl.updateOne(
      { key: 'global', $or: [{ quotaPausedUntil: null }, { quotaPausedUntil: { $lt: next.nextAttemptAt } }] },
      { $set: { quotaPausedUntil: next.nextAttemptAt, quotaReason: code } },
    )
  }
  return { ok: true, status: next.status, nextAttemptAt: next.nextAttemptAt ?? null }
}

async function notifyRejected(review) {
  try {
    const plugin = await Plugin.findById(review.pluginId).select('name').lean()
    const what = review.kind === 'service' ? `השירות ${review.serviceVersion} והתוסף ${review.pluginVersion}` : `עדכון התוסף ${review.pluginVersion}`
    await createSystemMessage({
      recipientId: review.ownerId,
      subject: `בדיקת ${plugin?.name || 'התוסף'} לא אושרה`,
      content: `הבדיקה של ${what} הסתיימה בדחייה.\n\nדוח הבדיקה:\n${review.report}\n\nאפשר לתקן ולהגיש הגשה חדשה מדף ניהול השירות: /plugins/${review.pluginId}/service`,
      source: 'service-plugin-review',
    })
    await ServicePluginReview.updateOne({ _id: review._id }, { $set: { emailSentAt: new Date() } })
  } catch (err) {
    console.error('[service-plugins] rejection notice failed:', err?.message)
  }
}

/**
 * תוצאת הבודק. ההחלטה והדוח נשמרים קודם (מותנה ב-lease); 0 → נדחה; 1 → קבלות חובה של אותה הגשה ואז פרסום.
 * @returns {Promise<{ok:true, status:string, published:boolean}|{ok:false, status:number, code:string}>}
 */
export async function submitResult({ reviewId, token, digest, decision, report, now = new Date() }) {
  const loaded = await loadLeased(reviewId, token, now)
  if (!loaded.ok) return loaded
  const { review } = loaded
  if (digest !== review.manifestDigest) return fail(409, 'digest_mismatch')
  const verdict = validateDecision({ decision, report })
  if (!verdict.ok) return fail(400, verdict.error)

  const stored = await ServicePluginReview.updateOne(leaseFilter(review, now), { $set: { decision: verdict.decision, report: verdict.report, decidedAt: now } })
  if (stored.matchedCount !== 1) return leaseLost()
  const decided = { ...review, decision: verdict.decision, report: verdict.report, decidedAt: now }

  if (verdict.decision === 0) {
    const res = await ServicePluginReview.updateOne(leaseFilter(review, now), {
      $set: { status: 'rejected', activeKey: null, nextAttemptAt: null, lease: CLEARED_LEASE },
    })
    if (res.matchedCount !== 1) return leaseLost()
    await Plugin.updateOne({ _id: review.pluginId, 'serviceState.activeReviewId': review._id }, { $set: { 'serviceState.activeReviewId': null } })
    await syncPortReservations(review.pluginId)
    await releaseScanLock(review._id)
    await notifyRejected(decided)
    return { ok: true, status: 'rejected', published: false }
  }

  const toOperator = async (code, message) => {
    const res = await ServicePluginReview.updateOne(leaseFilter(review, now), {
      $set: { status: 'needs_operator', nextAttemptAt: null, lease: CLEARED_LEASE, lastError: { class: 'operator', code, message, at: now } },
    })
    if (res.matchedCount !== 1) return leaseLost()
    await releaseScanLock(review._id)
    return { ok: true, status: 'needs_operator', published: false }
  }

  const missing = missingReceipts(review)
  if (missing.length) return toOperator('receipts_incomplete', `חסרות קבלות: ${missing.join(', ')}`)

  const already = await finalizeIfPublished(decided, { now })
  if (already.published) return { ok: true, status: 'approved', published: true }
  const published = await publishReview(decided, { now })
  if (published.ok) return { ok: true, status: 'approved', published: true }
  return toOperator(published.code, published.message)
}

/** רשימת ההגשות שתיקיות העבודה שלהן נשמרות אצל המתווך. */
export async function maintenanceKeepList() {
  const plugins = await Plugin.find({ hasService: true }).select('serviceState').lean()
  return plugins.map((p) => {
    const s = p.serviceState || {}
    const ids = [s.currentServiceReview, s.previousServiceReview, s.currentPluginReview, s.activeReviewId].filter(Boolean).map(String)
    return { pluginId: String(p._id), reviewIds: [...new Set(ids)] }
  })
}

/** קובץ הגשה למתווך בעל lease בתוקף. */
export async function openWorkerAsset({ reviewId, token, key, now = new Date() }) {
  const loaded = await loadLeased(reviewId, token, now)
  if (!loaded.ok) return loaded
  const { review } = loaded
  const sha256 = key === 'plugin' ? review.pluginAsset?.sha256 : (review.assets || []).find((a) => a.key === key)?.sha256
  if (!sha256) return fail(404, 'unknown_asset')
  const opened = await openReviewAssetStream(review._id, key)
  if (!opened) return fail(404, 'asset_missing')
  return { ok: true, ...opened, sha256 }
}
