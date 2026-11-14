// ניקוי שעתי. דוחות ומסמכי הגשה לעולם אינם נמחקים — רק קבצים.
import Plugin from '../../models/Plugin.js'
import ServicePluginReview from '../../models/ServicePluginReview.js'
import { ACTIVE_STATUSES, NATIVE_KEYS } from './policy.js'
import { deleteReviewFiles, sweepTmpFiles } from './storage.js'
import { finalizeIfPublished } from './publish.js'
import { syncPortReservations } from './ports.js'
import { cancelReview } from './reviews.js'

const HOUR = 3600_000
const DAY = 24 * HOUR
const PENDING_ADMIN_DAYS = 30
// נעילה טרייה עשויה להצביע על הגשה שעדיין נוצרת (createDraft נועל לפני היצירה)
const ORPHAN_LOCK_MS = 10 * 60_000

async function safely(summary, label, fn) {
  try {
    await fn()
  } catch (err) {
    summary.errors.push(label)
    console.error(`[service-plugins/cleanup] ${label} failed:`, err?.message)
  }
}

export async function runServicePluginCleanup(now = new Date()) {
  const summary = { expiredDrafts: 0, expiredPending: 0, releasedLocks: 0, unstuckSealing: 0, deletedReviewFiles: 0, deletedNativeFiles: 0, finalized: 0, tmpFiles: 0, errors: [] }

  await safely(summary, 'drafts', async () => {
    const drafts = await ServicePluginReview.find({ status: 'draft', createdAt: { $lt: new Date(now - DAY) } }).lean()
    for (const review of drafts) {
      const res = await cancelReview({ review, reason: 'טיוטה שלא הושלמה תוך 24 שעות', asAdmin: true, now })
      if (res.ok) summary.expiredDrafts++
    }
  })

  await safely(summary, 'pending_admin', async () => {
    const stale = await ServicePluginReview.find({ status: 'pending_admin', updatedAt: { $lt: new Date(now - PENDING_ADMIN_DAYS * DAY) } }).lean()
    for (const review of stale) {
      const res = await cancelReview({ review, reason: `ההגשה לא נבחרה לבדיקה תוך ${PENDING_ADMIN_DAYS} יום`, asAdmin: true, now })
      if (res.ok) summary.expiredPending++
    }
  })

  await safely(summary, 'sealing', async () => {
    const res = await ServicePluginReview.updateMany(
      { status: 'sealing', updatedAt: { $lt: new Date(now - HOUR) } },
      { $set: { status: 'draft' } },
    )
    summary.unstuckSealing = res.modifiedCount
  })

  await safely(summary, 'finalize', async () => {
    const decided = await ServicePluginReview.find({ decision: 1, status: { $in: ACTIVE_STATUSES } }).lean()
    for (const review of decided) {
      if ((await finalizeIfPublished(review, { now })).finalized) summary.finalized++
    }
  })

  await safely(summary, 'orphan locks', async () => {
    const cutoff = new Date(now - ORPHAN_LOCK_MS)
    const locked = await Plugin.find({ hasService: true, 'serviceState.activeReviewId': { $ne: null }, updatedAt: { $lt: cutoff } })
      .select('serviceState.activeReviewId').lean()
    for (const plugin of locked) {
      const reviewId = plugin.serviceState.activeReviewId
      const review = await ServicePluginReview.findById(reviewId).select('status updatedAt').lean()
      if (review && (ACTIVE_STATUSES.includes(review.status) || review.updatedAt >= cutoff)) continue
      const res = await Plugin.updateOne({ _id: plugin._id, 'serviceState.activeReviewId': reviewId }, { $set: { 'serviceState.activeReviewId': null } })
      summary.releasedLocks += res.modifiedCount
    }
  })

  await safely(summary, 'terminal files', async () => {
    const cutoff = new Date(now - 7 * DAY)
    const old = await ServicePluginReview.find({
      filesDeletedAt: null,
      $or: [
        { status: 'cancelled', $or: [{ cancelledAt: { $lt: cutoff } }, { cancelledAt: null, updatedAt: { $lt: cutoff } }] },
        { status: 'rejected', $or: [{ decidedAt: { $lt: cutoff } }, { decidedAt: null, updatedAt: { $lt: cutoff } }] },
      ],
    }).select('_id').lean()
    for (const review of old) {
      await deleteReviewFiles(review._id)
      await ServicePluginReview.updateOne({ _id: review._id, filesDeletedAt: null }, { $set: { filesDeletedAt: now } })
      summary.deletedReviewFiles++
    }
  })

  await safely(summary, 'native files', async () => {
    // ההגשות נקראות לפני המצביעים: הגשה שתפורסם בין שתי הקריאות לא תיחשב "ישנה".
    const approved = await ServicePluginReview.find({ status: 'approved', kind: 'service', nativeFilesDeletedAt: null }).select('_id').lean()
    const plugins = await Plugin.find({ hasService: true }).select('serviceState').lean()
    const keep = new Set()
    for (const p of plugins) {
      for (const id of [p.serviceState?.currentServiceReview, p.serviceState?.previousServiceReview]) if (id) keep.add(String(id))
    }
    for (const review of approved) {
      if (keep.has(String(review._id))) continue
      await deleteReviewFiles(review._id, { keys: NATIVE_KEYS })
      await ServicePluginReview.updateOne({ _id: review._id, nativeFilesDeletedAt: null }, { $set: { nativeFilesDeletedAt: now } })
      summary.deletedNativeFiles++
    }
  })

  await safely(summary, 'ports', async () => {
    for (const plugin of await Plugin.find({ hasService: true }).select('_id').lean()) await syncPortReservations(plugin._id)
  })

  await safely(summary, 'tmp', async () => {
    summary.tmpFiles = await sweepTmpFiles(DAY, process.env, now.getTime())
  })

  return summary
}
