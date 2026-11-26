// חריגה מפורשת מכל תוצאת ClamAV. הרשאות limits ישנות אינן מורחבות בדיעבד.
import { randomUUID } from 'node:crypto'
import Plugin from '../../models/Plugin.js'
import ServicePluginReview from '../../models/ServicePluginReview.js'
import { ACTIVE_STATUSES, LIMITS, canOverrideClamavFailure, validateDraftRequest } from './policy.js'
import { findPortConflict, isPortDuplicate, portKeys, portTaken, syncPortReservations } from './ports.js'
import { CLEARED_LEASE } from './publish.js'
import { reviewAssetSize } from './storage.js'

const fail = (code, message) => ({ ok: false, status: 409, code, message })
const sameId = (a, b) => a != null && b != null && String(a) === String(b)
export const rejectedClamavReceipt = (review) => review?.status === 'rejected' && review.decision === 0
  ? (review.receipts || []).find((r) => r.stage === 'clamav' && r.digest === review.manifestDigest && r.data?.rejected === true) ?? null : null

/** החזרת כוונה שלא הושלמה למצב נדחה; fence מונע שחרור נעילה של ניסיון חדש. נקרא גם בניקוי. */
export async function releaseClamavReopen(review, token) {
  const released = await ServicePluginReview.updateOne({ _id: review._id, status: 'rejected', 'reopeningClamav.token': token },
    { $set: { activeKey: null } })
  if (released.matchedCount !== 1) {
    // הניקוי יכול לבטל כוונה לפני שהבקשה האיטית תפסה את Plugin. משחררים רק fence ישן,
    // ולעולם לא תור תקף שאותה בקשה כבר השלימה לפני שנאבדה תשובת המסד.
    const current = await ServicePluginReview.findById(review._id).select('status').lean()
    // claimNext מקדם תחילה את fence ההגשה ורק אחר כך את Plugin. גם ניסיון פעיל
    // עם fence מתקדם עדיין זקוק לנעילת Plugin הישנה בחלון שבין הכתיבות.
    if (current && ACTIVE_STATUSES.includes(current.status)) return
  }
  await Plugin.updateOne({ _id: review.pluginId, 'serviceState.activeReviewId': review._id, 'serviceState.activeFence': review.fence },
    { $set: { 'serviceState.activeReviewId': null } })
  await syncPortReservations(review.pluginId)
  await ServicePluginReview.updateOne({ _id: review._id, status: 'rejected', 'reopeningClamav.token': token },
    { $set: { reopeningClamav: null } })
}

function stillPublishable(plugin, review) {
  const s = plugin.serviceState || {}
  const body = { kind: review.kind, pluginVersion: review.pluginVersion, pluginSize: review.pluginAsset?.size,
    serviceRange: review.serviceRange, sources: review.sources, changeNotes: review.changeNotes,
    virusTotalConsent: review.virusTotalConsent,
    ...(review.kind === 'service' ? { serviceVersion: review.serviceVersion, uninstall: review.uninstall, assets: review.assets } : {}) }
  return validateDraftRequest(body, {
    currentPluginVersion: s.currentPluginReview ? plugin.version : null,
    currentServiceVersion: s.currentServiceReview ? s.serviceVersion : null,
    hasApprovedService: !!s.currentServiceReview,
    publishedPluginVersions: s.publishedPluginVersions || [], publishedServiceVersions: s.publishedServiceVersions || [],
  })
}

export async function adminAcceptClamavResult({ plugin, review, admin, reason, now = new Date() }) {
  const rejected = rejectedClamavReceipt(review)
  if (!rejected && !canOverrideClamavFailure(review)) return fail('invalid_state', 'אפשר לאשר חריגת ClamAV רק אחרי תקלה או דחייה בשלב ClamAV')
  const text = typeof reason === 'string' ? reason.trim() : ''
  if (!text || text.length > LIMITS.reasonChars) return { ok: false, status: 400, code: 'reason_required', message: `יש לכתוב סיבה (עד ${LIMITS.reasonChars} תווים)` }
  if (!plugin?.hasService || !sameId(plugin._id, review.pluginId) || plugin.isHidden || plugin.isSuspended) return fail('plugin_unavailable', 'התוסף אינו זמין לבדיקה')
  const token = randomUUID()
  const override = { reason: text, grantedBy: admin?._id ?? admin?.id ?? null, grantedAt: now, scope: 'all_results', grantId: token }
  const previous = { status: review.status, decision: review.decision, report: review.report, decidedAt: review.decidedAt,
    lastError: review.lastError, clamavReceipt: rejected ?? (review.receipts || []).find((r) => r.stage === 'clamav') ?? null }
  const set = { status: 'queued', attempts: 0, unknownQuotaWaits: 0, leaseExpiries: 0, nextAttemptAt: now,
    lastError: null, lease: CLEARED_LEASE, decision: null, report: null, decidedAt: null, emailSentAt: null,
    'operatorOverrides.clamavPartial': override,
    // משמרים hash מוצמד בלבד; שום החלטה/קבלת דחייה ישנה אינה מקצרת את המשך הבדיקה.
    receipts: (review.receipts || []).filter((r) => r.stage === 'hashes' && r.digest === review.manifestDigest) }
  const update = { $set: set, $push: { clamavOverrideHistory: { ...override, previous } } }
  if (!rejected) {
    if (!await Plugin.exists({ _id: review.pluginId, 'serviceState.activeReviewId': review._id })) return fail('lock_mismatch', 'ההגשה אינה ההגשה הפעילה של התוסף')
    const res = await ServicePluginReview.updateOne({ _id: review._id, status: review.status, fence: review.fence,
      'lastError.code': review.lastError.code, activeKey: String(review.pluginId) }, update)
    return res.modifiedCount === 1 ? { ok: true, status: 'queued' } : fail('invalid_state', 'ההגשה השתנתה בזמן הפעולה')
  }

  if (plugin.serviceState?.activeReviewId) return fail('active_review_exists', 'לתוסף כבר יש הגשה פעילה')
  if (review.filesDeletedAt || review.filesDeletingAt || review.nativeFilesDeletedAt) return fail('files_unavailable', 'קובצי ההגשה כבר נמחקו או נמצאים במחיקה; יש להגיש מחדש')
  const valid = stillPublishable(plugin, review)
  if (!valid.ok) return fail('version_conflict', valid.errors.join('\n'))
  if (await ServicePluginReview.countDocuments({ ownerId: review.ownerId, activeKey: { $type: 'string' } }) >= LIMITS.maxActivePerDeveloper) return fail('too_many_active', 'לבעל התוסף יש יותר מדי הגשות פעילות')
  const conflict = await findPortConflict(plugin._id, review.assets)
  if (conflict) return conflict
  const fence = (review.fence || 0) + 1
  let reserved
  try {
    reserved = await ServicePluginReview.updateOne({ _id: review._id, status: 'rejected', decision: 0,
    fence: review.fence, activeKey: null, reopeningClamav: null, filesDeletedAt: null, filesDeletingAt: null,
    receipts: { $elemMatch: { stage: 'clamav', digest: review.manifestDigest, 'data.rejected': true } } },
  { $set: { activeKey: String(review.pluginId), reopeningClamav: { token, at: now }, fence,
    reopenGeneration: (review.reopenGeneration || 0) + 1 } })
  } catch (err) {
    if (err?.code === 11000) return fail('active_review_exists', 'לתוסף כבר יש הגשה פעילה')
    throw err
  }
  if (reserved.modifiedCount !== 1) return fail('invalid_state', 'ההגשה השתנתה או שקבציה נמצאים במחיקה')
  const reservedReview = { ...review, fence }
  try {
    for (const asset of [{ key: 'plugin', size: review.pluginAsset?.size }, ...(review.assets || [])]) {
      if (await reviewAssetSize(review._id, asset.key) !== asset.size) {
        await releaseClamavReopen(reservedReview, token)
        return fail('files_unavailable', 'קובצי ההגשה חסרים או השתנו; יש להגיש מחדש')
      }
    }
    const s = plugin.serviceState || {}
    const locked = await Plugin.updateOne({ _id: plugin._id, hasService: true, isHidden: { $ne: true }, isSuspended: { $ne: true },
      version: plugin.version, 'serviceState.activeReviewId': null, 'serviceState.currentPluginReview': s.currentPluginReview ?? null,
      'serviceState.currentServiceReview': s.currentServiceReview ?? null },
    { $set: { 'serviceState.activeReviewId': review._id, 'serviceState.activeFence': fence },
      ...(review.assets?.length ? { $addToSet: { 'serviceState.reservedPortKeys': { $each: portKeys(review.assets) } } } : {}) })
    if (locked.modifiedCount !== 1) {
      await releaseClamavReopen(reservedReview, token)
      return fail('active_review_exists', 'מצב התוסף השתנה או שכבר קיימת הגשה פעילה')
    }
    if (await ServicePluginReview.countDocuments({ ownerId: review.ownerId, activeKey: { $type: 'string' } }) > LIMITS.maxActivePerDeveloper) {
      await releaseClamavReopen(reservedReview, token)
      return fail('too_many_active', 'לבעל התוסף יש יותר מדי הגשות פעילות')
    }
    set.reopeningClamav = null
    set.baseCurrentPluginReview = s.currentPluginReview ?? null
    const res = await ServicePluginReview.updateOne({ _id: review._id, status: 'rejected', fence, activeKey: String(review.pluginId), 'reopeningClamav.token': token }, update)
    if (res.modifiedCount !== 1) {
      await releaseClamavReopen(reservedReview, token)
      return fail('invalid_state', 'ההגשה השתנתה בזמן הפעולה')
    }
    return { ok: true, status: 'queued' }
  } catch (err) {
    // כתיבה יכולה להצליח לפני ניתוק התשובה; אין להפקיע תור/lease שכבר נוצרו.
    const current = await ServicePluginReview.findById(review._id).select('operatorOverrides').lean()
    // eslint-disable-next-line security/detect-possible-timing-attacks -- מזהה פעולת תיעוד, לא סוד או אסימון הזדהות.
    if (current?.operatorOverrides?.clamavPartial?.grantId === token) return { ok: true, status: 'queued' }
    await releaseClamavReopen(reservedReview, token)
    if (isPortDuplicate(err)) return portTaken()
    throw err
  }
}
