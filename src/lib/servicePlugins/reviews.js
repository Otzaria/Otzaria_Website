// פעולות הדומיין של הגשות תוספי שירות (מפתח ומנהל). כל כתיבה היא עדכון מותנה עם מסנן מפורש.
// מחזירות {ok:true,...} או {ok:false, status, code, message} — הראוטים ממפים ל-HTTP.
import mongoose from 'mongoose'
import Plugin from '../../models/Plugin.js'
import ServicePluginReview from '../../models/ServicePluginReview.js'
import ServiceScanControl from '../../models/ServiceScanControl.js'
import { validatePluginArchive } from '../pluginValidation.js'
import { readManifestFromPlugin } from '../pluginManifest.js'
import {
  LIMITS, POLICY_VERSION, ACTIVE_STATUSES, OWNER_CANCELLABLE, validateDraftRequest, submissionDigest,
  cooldownState, versionInRange,
} from './policy.js'
import { findPortConflict, portKeys, portTaken, isPortDuplicate, syncPortReservations } from './ports.js'
import { readReviewAssetBuffer, deleteReviewFiles } from './storage.js'
import { finalizeIfPublished, releaseScanLock, CLEARED_LEASE } from './publish.js'

export { publishReview, finalizeIfPublished, rollback } from './publish.js'
export { claimNext, heartbeat, checkpoint, reportFailure, submitResult, maintenanceKeepList, openWorkerAsset } from './workerOps.js'

const { ObjectId } = mongoose.Types
const fail = (status, code, message, more = {}) => ({ ok: false, status, code, message, ...more })
const sameId = (a, b) => a != null && b != null && String(a) === String(b)
const PRE_QUEUE = ['draft', 'sealing', 'pending_admin']

export const isPluginOwner = (plugin, userId) => sameId(plugin?.authorId, userId)

export function formatHebrewDate(date) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

/** ההקשר של validateDraftRequest מתוך מצב התוסף. גרסה "נוכחית" = רק מה שפורסם בבדיקה. */
export function draftContext(plugin) {
  const s = plugin?.serviceState || {}
  return {
    pluginUid: plugin?.pluginUid ?? null,
    currentPluginVersion: s.currentPluginReview ? plugin.version : null,
    currentServiceVersion: s.currentServiceReview ? s.serviceVersion : null,
    currentServiceRange: s.serviceRange?.min ? { min: s.serviceRange.min, max: s.serviceRange.max ?? null } : null,
    hasApprovedService: !!s.currentServiceReview,
    publishedPluginVersions: s.publishedPluginVersions || [],
    publishedServiceVersions: s.publishedServiceVersions || [],
  }
}

export function uploadUrls(pluginId, review) {
  const base = `/api/service-plugins/${pluginId}/drafts/${review._id}/assets`
  const urls = { plugin: `${base}/plugin` }
  for (const a of review.assets || []) urls[a.key] = `${base}/${a.key}`
  return urls
}

const tooManyActive = () => fail(429, 'too_many_active', `אפשר להחזיק עד ${LIMITS.maxActivePerDeveloper} הגשות פעילות בו-זמנית. יש לסיים או לבטל הגשה קיימת`)

async function releasePluginLock(pluginId, reviewId) {
  await Plugin.updateOne({ _id: pluginId, 'serviceState.activeReviewId': reviewId }, { $set: { 'serviceState.activeReviewId': null } })
  await syncPortReservations(pluginId)
}

/** יצירת טיוטה: בעלים בלבד, נעילה אטומית לתוסף, עד 3 פעילות למפתח, פורט ייחודי. */
export async function createDraft({ plugin, user, body }) {
  if (!plugin?.hasService) return fail(409, 'not_service_plugin', 'התוסף אינו מסומן כדורש שירות חיצוני')
  const userId = user?._id ?? user?.id
  if (!isPluginOwner(plugin, userId)) return fail(403, 'forbidden', 'רק מעלה התוסף רשאי להגיש עבורו')
  if (plugin.isHidden === true || plugin.isSuspended === true) {
    return fail(409, 'plugin_unavailable', 'התוסף מוסתר או מושהה, ולכן אי אפשר להגיש עבורו בדיקה כעת')
  }
  const validation = validateDraftRequest(body, draftContext(plugin))
  if (!validation.ok) return fail(400, 'validation_failed', 'ההגשה אינה תקינה', { errors: validation.errors })
  const value = validation.value
  const ownerId = new ObjectId(String(userId))

  if (await ServicePluginReview.countDocuments({ ownerId, activeKey: { $type: 'string' } }) >= LIMITS.maxActivePerDeveloper) return tooManyActive()
  const portConflict = await findPortConflict(plugin._id, value.assets)
  if (portConflict) return portConflict

  const reviewId = new ObjectId()
  // ממתינים ליצירת האינדקס לפני קבלת שריון ראשון גם בתהליך אתר חדש.
  await Plugin.init()
  let locked
  try {
    locked = await Plugin.updateOne(
      { _id: plugin._id, hasService: true, 'serviceState.activeReviewId': null },
      { $set: { 'serviceState.activeReviewId': reviewId },
        ...(value.assets.length ? { $addToSet: { 'serviceState.reservedPortKeys': { $each: portKeys(value.assets) } } } : {}) },
    )
  } catch (err) {
    if (isPortDuplicate(err)) return portTaken()
    throw err
  }
  if (locked.modifiedCount !== 1) return fail(409, 'active_review_exists', 'לתוסף זה כבר יש הגשה פעילה. יש לסיים או לבטל אותה לפני הגשה חדשה')

  let review
  try {
    review = await ServicePluginReview.create({
      _id: reviewId,
      pluginId: plugin._id,
      ownerId,
      kind: value.kind,
      pluginVersion: value.pluginVersion,
      serviceVersion: value.serviceVersion,
      serviceRange: value.serviceRange,
      sources: value.sources,
      changeNotes: value.changeNotes,
      uninstall: value.uninstall,
      virusTotalConsent: value.virusTotalConsent,
      pluginAsset: { size: value.pluginSize },
      assets: value.assets,
      policyVersion: POLICY_VERSION,
      status: 'draft',
      activeKey: String(plugin._id),
    })
  } catch (err) {
    await releasePluginLock(plugin._id, reviewId)
    if (err?.code === 11000) return fail(409, 'active_review_exists', 'לתוסף זה כבר יש הגשה פעילה')
    throw err
  }

  // בדיקה חוזרת אחרי ההוספה: שתי יצירות מקבילות לא יעקפו את המגבלות.
  const after = await ServicePluginReview.countDocuments({ ownerId, activeKey: { $type: 'string' } })
  const conflict = after > LIMITS.maxActivePerDeveloper
    ? tooManyActive()
    : await findPortConflict(plugin._id, value.assets)
  if (conflict) {
    await ServicePluginReview.updateOne(
      { _id: reviewId, status: 'draft' },
      { $set: { status: 'cancelled', activeKey: null, cancelReason: conflict.code, cancelledAt: new Date() }, $inc: { fence: 1 } },
    )
    await releasePluginLock(plugin._id, reviewId)
    return conflict
  }
  const doc = review.toObject()
  return { ok: true, review: doc, uploads: uploadUrls(plugin._id, doc) }
}

/** מה מותר להעלות עכשיו למפתח הזה: {ok, size, maxBytes} */
export function assetSlot(review, key) {
  if (review.status !== 'draft') return fail(409, 'invalid_state', 'אפשר להעלות קבצים רק להגשה בטיוטה')
  if (key === 'plugin') {
    if (review.pluginAsset?.receivedAt) return fail(409, 'asset_exists', 'קובץ התוסף כבר הועלה להגשה זו')
    return { ok: true, size: review.pluginAsset.size, maxBytes: LIMITS.pluginBytes }
  }
  const asset = (review.assets || []).find((a) => a.key === key)
  if (!asset) return fail(404, 'unknown_asset', 'הקובץ לא הוצהר בהגשה זו')
  if (asset.receivedAt) return fail(409, 'asset_exists', 'הקובץ כבר הועלה להגשה זו')
  return { ok: true, size: asset.size, maxBytes: LIMITS.installerBytes }
}

export async function recordAssetUpload({ review, key, sha256, now = new Date() }) {
  const res = key === 'plugin'
    ? await ServicePluginReview.updateOne(
      { _id: review._id, status: 'draft', 'pluginAsset.receivedAt': null },
      { $set: { 'pluginAsset.sha256': sha256, 'pluginAsset.receivedAt': now } },
    )
    : await ServicePluginReview.updateOne(
      { _id: review._id, status: 'draft', assets: { $elemMatch: { key, receivedAt: null } } },
      { $set: { 'assets.$.sha256': sha256, 'assets.$.receivedAt': now } },
    )
  if (res.modifiedCount !== 1) return fail(409, 'invalid_state', 'ההגשה השתנתה בזמן ההעלאה')
  return { ok: true }
}

const SDK_UNAVAILABLE = 'בדיקת התוסף נכשלה או חרגה ממגבלת הזמן. ההגשה נשארה בטיוטה; נסו שוב מאוחר יותר'

/** הקפאה: כל הקבצים התקבלו, ה-SDK והמניפסט תואמים → pending_admin עם digest; אחרת חזרה לטיוטה. */
export async function sealDraft({ review, plugin, now = new Date() }) {
  if (review.status !== 'draft') return fail(409, 'invalid_state', 'אפשר להקפיא רק הגשה בטיוטה')
  const missing = []
  if (!review.pluginAsset?.receivedAt) missing.push('קובץ התוסף (plugin) טרם הועלה')
  for (const a of review.assets || []) if (!a.receivedAt) missing.push(`המתקין ${a.name} (${a.key}) טרם הועלה`)
  if (missing.length) return fail(400, 'missing_files', 'לא כל הקבצים הועלו', { errors: missing })

  const moved = await ServicePluginReview.updateOne({ _id: review._id, status: 'draft' }, { $set: { status: 'sealing' } })
  if (moved.modifiedCount !== 1) return fail(409, 'invalid_state', 'ההגשה השתנתה; רעננו ונסו שוב')

  const backToDraft = async (status, code, message, errors) => {
    await ServicePluginReview.updateOne(
      { _id: review._id, status: 'sealing' },
      { $set: { status: 'draft', lastError: { class: 'validation', code, message: (errors?.join('\n') || message).slice(0, LIMITS.reasonChars), at: now } } },
    )
    return fail(status, code, message, errors ? { errors } : {})
  }

  let buffer
  try {
    buffer = await readReviewAssetBuffer(review._id, 'plugin', LIMITS.pluginBytes)
  } catch (err) {
    console.error('[service-plugins] seal read failed:', err?.code || err?.message)
    return backToDraft(503, 'storage_unavailable', 'אחסון הקבצים אינו זמין כרגע; נסו שוב מאוחר יותר')
  }
  if (!buffer) return backToDraft(400, 'missing_files', 'קובץ התוסף חסר באחסון', ['קובץ התוסף חסר באחסון'])

  let validation
  try {
    validation = await validatePluginArchive(buffer)
  } catch (err) {
    console.error('[service-plugins] SDK validation failed:', err?.code || err?.message)
    return backToDraft(503, 'sdk_unavailable', SDK_UNAVAILABLE)
  }
  const issues = [...(validation?.errors || []), ...(validation?.warnings || [])]
  if (issues.length) return backToDraft(400, 'sdk_validation_failed', 'קובץ התוסף לא עבר ולידציה מול ה-SDK הרשמי', issues)

  let manifest
  try {
    manifest = await readManifestFromPlugin(buffer)
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('PLUGIN_')) return backToDraft(503, 'sdk_unavailable', SDK_UNAVAILABLE)
    return backToDraft(400, 'manifest_invalid', 'לא ניתן לקרוא את manifest.json מקובץ התוסף', ['לא ניתן לקרוא את manifest.json מקובץ התוסף'])
  }
  const errors = []
  if (!manifest || typeof manifest !== 'object') {
    errors.push('manifest.json אינו אובייקט')
  } else {
    if (String(manifest.id ?? '').trim() !== plugin.pluginUid) errors.push(`המזהה ב-manifest.json (${manifest.id}) אינו תואם למזהה התוסף (${plugin.pluginUid})`)
    if (String(manifest.version ?? '').trim() !== review.pluginVersion) errors.push(`הגרסה ב-manifest.json (${manifest.version}) אינה תואמת לגרסת התוסף שבהגשה (${review.pluginVersion})`)
    if (!manifest.minAppVersion) errors.push('חסר שדה minAppVersion ב-manifest.json')
  }
  if (errors.length) return backToDraft(400, 'manifest_mismatch', 'המניפסט אינו תואם להגשה', errors)

  const frozen = JSON.parse(JSON.stringify(manifest))
  const digest = submissionDigest({ ...review, manifest: frozen })
  try {
    const done = await ServicePluginReview.updateOne(
      { _id: review._id, status: 'sealing' },
      { $set: { status: 'pending_admin', manifest: frozen, manifestDigest: digest, lastError: null } },
    )
    if (done.modifiedCount !== 1) return fail(409, 'invalid_state', 'ההגשה בוטלה בזמן ההקפאה')
  } catch (err) {
    console.error('[service-plugins] seal store failed:', err?.message)
    return backToDraft(400, 'manifest_invalid', 'לא ניתן לשמור את manifest.json של התוסף', ['לא ניתן לשמור את manifest.json של התוסף'])
  }
  return { ok: true, status: 'pending_admin', digest }
}

// הקבצים נמחקים מיד: אחרת יצירה וביטול חוזרים ממלאים את הדיסק. כשל נשאר לניקוי של 7 הימים.
async function discardReviewFiles(reviewId, now) {
  try {
    await deleteReviewFiles(reviewId)
    await ServicePluginReview.updateOne({ _id: reviewId, filesDeletedAt: null }, { $set: { filesDeletedAt: now } })
  } catch (err) {
    console.error('[service-plugins] delete cancelled files failed:', err?.code || err?.message)
  }
}

// בודק שבוטל ממשיך לרוץ עד שה-lease שלו פג, ולכן הנעילה הגלובלית נשמרת עד אז — שתי בדיקות לא יחפפו.
async function releaseScanLockAfterCancel(reviewId, previous, now) {
  const until = previous?.status === 'running' ? previous.lease?.expiresAt : null
  if (until && until > now) {
    await ServiceScanControl.updateOne({ key: 'global', 'lock.reviewId': reviewId }, { $set: { 'lock.expiresAt': until } })
  } else {
    await releaseScanLock(reviewId)
  }
}

/**
 * ביטול. לפני התור (טיוטה/ממתין) — הסטטוס קודם; משלב התור והלאה — קודם מפקיעים את נעילת הפרסום
 * ב-Plugin ומגדילים fence, כך שבודק באמצע ריצה לא יוכל לפרסם.
 */
export async function cancelReview({ review, by = null, reason = null, asAdmin = false, now = new Date() }) {
  const allowed = asAdmin ? ACTIVE_STATUSES : OWNER_CANCELLABLE
  if (!allowed.includes(review.status)) {
    return fail(409, 'invalid_state', asAdmin ? 'ההגשה כבר הסתיימה' : 'אפשר לבטל רק הגשה שעדיין לא נבחרה לבדיקה')
  }
  const set = {
    status: 'cancelled', activeKey: null, nextAttemptAt: null, lease: CLEARED_LEASE,
    cancelledBy: by ?? null, cancelReason: typeof reason === 'string' ? reason.slice(0, LIMITS.reasonChars) : null, cancelledAt: now,
  }
  if (PRE_QUEUE.includes(review.status)) {
    const res = await ServicePluginReview.updateOne({ _id: review._id, status: { $in: asAdmin ? PRE_QUEUE : OWNER_CANCELLABLE } }, { $set: set, $inc: { fence: 1 } })
    if (res.modifiedCount !== 1) return fail(409, 'invalid_state', 'מצב ההגשה השתנה; רעננו ונסו שוב')
    await releasePluginLock(review.pluginId, review._id)
    await discardReviewFiles(review._id, now)
    return { ok: true, status: 'cancelled' }
  }

  const unlocked = await Plugin.updateOne(
    { _id: review.pluginId, 'serviceState.activeReviewId': review._id },
    { $set: { 'serviceState.activeReviewId': null }, $inc: { 'serviceState.activeFence': 1 } },
  )
  if (unlocked.modifiedCount !== 1) {
    // ייתכן שהבודק פרסם בינתיים: finalizeIfPublished בודק לפי מצביעי Plugin, לא לפי העותק שבידינו
    const fin = await finalizeIfPublished(review, { now })
    if (fin.published) return fail(409, 'already_published', 'ההגשה כבר פורסמה ואי אפשר לבטל אותה')
  }
  const previous = await ServicePluginReview.findOneAndUpdate(
    { _id: review._id, status: { $in: ACTIVE_STATUSES } },
    { $set: set, $inc: { fence: 1 } },
    { returnDocument: 'before', projection: { status: 1, lease: 1 } },
  ).lean()
  await syncPortReservations(review.pluginId)
  await releaseScanLockAfterCancel(review._id, previous, now)
  if (!previous) return fail(409, 'invalid_state', 'ההגשה כבר הסתיימה')
  return { ok: true, status: 'cancelled' }
}

/** בחירת מנהל = אישור פרסום מותנה. בדיקת שירות כפופה ל-21 יום (או לחריגה חד-פעמית שנצרכת כאן). */
export async function adminStart({ plugin, review, admin, now = new Date() }) {
  if (review.status !== 'pending_admin') return fail(409, 'invalid_state', 'אפשר להתחיל בדיקה רק להגשה שממתינה לבחירת מנהל')
  const s = plugin.serviceState || {}
  if (!sameId(s.activeReviewId, review._id)) return fail(409, 'lock_mismatch', 'ההגשה אינה ההגשה הפעילה של התוסף')

  const filter = { _id: plugin._id, 'serviceState.activeReviewId': review._id, 'serviceState.currentPluginReview': s.currentPluginReview ?? null }
  let start = { selectedBy: admin?._id ?? admin?.id ?? null, selectedAt: now, baseCurrentPluginReview: s.currentPluginReview ?? null, exceptionUsed: null }
  if (review.kind === 'service') {
    if (sameId(s.cycleStart?.reviewId, review._id)) {
      start = s.cycleStart
    } else {
      const cooldown = cooldownState(s.lastServiceCycleStartedAt, now)
      if (cooldown.blocked && !s.adminException) {
        return fail(409, 'cooldown', `אפשר להתחיל בדיקת שירות חדשה רק מ-${formatHebrewDate(cooldown.nextAllowedAt)}, או בחריגת מנהל חד-פעמית עם סיבה`, {
          extra: { nextAllowedAt: cooldown.nextAllowedAt },
        })
      }
      // הכוונה כוללת גם את החריגה והבוחר המקוריים: ניסיון חוזר משלים אותה בלי לצרוך שוב.
      start = { ...start, reviewId: review._id,
        exceptionUsed: s.adminException ? { reason: s.adminException.reason, grantedBy: s.adminException.grantedBy } : null }
      filter['serviceState.lastServiceCycleStartedAt'] = s.lastServiceCycleStartedAt ?? null
      filter['serviceState.cycleStart.reviewId'] = s.cycleStart?.reviewId ?? null
      filter['serviceState.adminException.grantedAt'] = s.adminException?.grantedAt ?? null
      const guard = await Plugin.updateOne(filter, { $set: {
        'serviceState.lastServiceCycleStartedAt': now, 'serviceState.adminException': null, 'serviceState.cycleStart': start,
      } })
      if (guard.modifiedCount !== 1) {
        // בקשה מקבילה יכולה כבר לשמור את אותה כוונה. אין לדרוס את הבחירה שלה.
        const latest = await Plugin.findOne({ _id: plugin._id, 'serviceState.activeReviewId': review._id,
          'serviceState.cycleStart.reviewId': review._id }).select('serviceState.cycleStart').lean()
        if (!latest) return fail(409, 'conflict', 'מצב התוסף השתנה בזמן הפעולה; רעננו ונסו שוב')
        start = latest.serviceState.cycleStart
      }
    }
  } else {
    if (!s.currentServiceReview || !versionInRange(s.serviceVersion, review.serviceRange)) {
      return fail(409, 'service_mismatch', 'גרסת השירות המאושרת הנוכחית אינה בטווח שהוצהר בעדכון התוסף')
    }
    filter['serviceState.currentServiceReview'] = s.currentServiceReview
    if (!await Plugin.exists(filter)) return fail(409, 'conflict', 'מצב התוסף השתנה בזמן הפעולה; רעננו ונסו שוב')
  }
  const { selectedBy, selectedAt, baseCurrentPluginReview, exceptionUsed } = start
  const res = await ServicePluginReview.updateOne(
    { _id: review._id, status: 'pending_admin' },
    {
      $set: {
        status: 'queued', selectedBy, selectedAt, baseCurrentPluginReview,
        exceptionUsed, attempts: 0, unknownQuotaWaits: 0, nextAttemptAt: now, lastError: null,
      },
    },
  )
  if (res.modifiedCount !== 1) return fail(409, 'invalid_state', 'ההגשה השתנתה בזמן הפעולה')
  return { ok: true, status: 'queued', exceptionUsed: !!exceptionUsed }
}

export async function adminRetry({ review, now = new Date() }) {
  if (review.status !== 'needs_operator') return fail(409, 'invalid_state', 'ניסיון חוזר אפשרי רק להגשה שממתינה לטיפול תפעולי')
  const res = await ServicePluginReview.updateOne(
    { _id: review._id, status: 'needs_operator' },
    { $set: { status: 'queued', attempts: 0, unknownQuotaWaits: 0, leaseExpiries: 0, nextAttemptAt: now, lastError: null, lease: CLEARED_LEASE } },
  )
  if (res.modifiedCount !== 1) return fail(409, 'invalid_state', 'ההגשה השתנתה בזמן הפעולה')
  return { ok: true, status: 'queued' }
}

/** חריגה חד-פעמית מ-21 הימים, עם סיבה. נצרכת בהתחלת בדיקת השירות הבאה ואינה עוקפת שום בדיקה. */
export async function adminEmergency({ plugin, admin, reason, now = new Date() }) {
  if (!plugin?.hasService) return fail(409, 'not_service_plugin', 'התוסף אינו תוסף שירות')
  const text = typeof reason === 'string' ? reason.trim() : ''
  if (!text || text.length > LIMITS.reasonChars) return fail(400, 'reason_required', `יש לכתוב סיבה לחריגה (עד ${LIMITS.reasonChars} תווים)`)
  await Plugin.updateOne(
    { _id: plugin._id, hasService: true },
    { $set: { 'serviceState.adminException': { reason: text, grantedBy: admin?._id ?? admin?.id ?? null, grantedAt: now } } },
  )
  return { ok: true }
}

/** התוסף וההגשה, לבעלי התוסף בלבד. */
export async function loadOwnedReview({ pluginId, reviewId, userId }) {
  const plugin = await Plugin.findById(pluginId).select('authorId hasService pluginUid version serviceState').lean()
  if (!plugin) return fail(404, 'not_found', 'לא נמצא')
  if (!isPluginOwner(plugin, userId)) return fail(403, 'forbidden', 'אין הרשאה לבצע פעולה זו')
  const review = await ServicePluginReview.findOne({ _id: reviewId, pluginId: plugin._id }).lean()
  if (!review) return fail(404, 'not_found', 'לא נמצא')
  return { ok: true, plugin, review }
}
