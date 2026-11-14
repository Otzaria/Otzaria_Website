// פרסום הגשה שאושרה, שחזור פרסום שנקטע, וחזרה לאחור. כל שינוי ב-Plugin הוא עדכון מותנה יחיד.
import Plugin from '../../models/Plugin.js'
import User from '../../models/User.js'
import ServicePluginReview from '../../models/ServicePluginReview.js'
import ServiceScanControl from '../../models/ServiceScanControl.js'
import { revalidateNow, CACHE_TAGS } from '../cacheTags.js'
import { invalidatePluginSearchIndex } from '../pluginSearchIndex.js'
import { sendPluginApprovalNotification } from '../emailService.js'
import { syncPortReservations } from './ports.js'
import { ACTIVE_STATUSES } from './policy.js'

const PLUGIN_STABILITY = ['stable', 'beta', 'experimental']
const PLUGIN_FILE_NAME = 'plugin.otzplugin'
const PLUGIN_FILE_EXT = '.otzplugin'

export const CLEARED_LEASE = Object.freeze({ owner: null, tokenHash: null, expiresAt: null })

const fail = (status, code, message, more = {}) => ({ ok: false, status, code, message, ...more })
const sameId = (a, b) => a != null && b != null && String(a) === String(b)

export async function releaseScanLock(reviewId) {
  await ServiceScanControl.updateOne({ key: 'global', 'lock.reviewId': reviewId }, { $set: { lock: null } })
}

export function platformsOf(review) {
  return (review.assets || []).map((a) => ({
    os: a.os, arch: a.arch, minOs: a.minOs, port: a.port, fileKey: a.key, name: a.name, size: a.size, sha256: a.sha256,
  }))
}

export function portsOf(review) {
  const byOs = new Map()
  for (const a of review.assets || []) if (!byOs.has(a.os)) byOs.set(a.os, a.port)
  return [...byOs].map(([os, port]) => ({ os, port }))
}

/** מטא-דאטה של גרסת התוסף מתוך המניפסט הקפוא של ההגשה. */
function pluginFieldsOf(review, plugin, now) {
  const manifest = review.manifest || {}
  return {
    version: review.pluginVersion,
    compatibleWith: manifest.minAppVersion ? String(manifest.minAppVersion) : plugin.compatibleWith,
    maxAppVersion: manifest.maxAppVersion ? String(manifest.maxAppVersion) : null,
    requiresNetwork: manifest.network?.enabled === true,
    status: PLUGIN_STABILITY.includes(manifest.stability) ? manifest.stability : 'stable',
    // ההורדה הוותיקה מגישה את הקובץ בשם הזה (Content-Disposition), כמו נתיב ההורדה המוצמד
    pluginFileName: plugin.slug ? `${plugin.slug}-${review.pluginVersion}${PLUGIN_FILE_EXT}` : PLUGIN_FILE_NAME,
    pluginFileExt: PLUGIN_FILE_EXT,
    pluginFileSize: review.pluginAsset?.size ?? 0,
    pluginFileSha256: review.pluginAsset?.sha256 ?? null,
    fileUpdatedAt: now,
  }
}

/** היסטוריית הגרסאות אחרי החלפת הגרסה הנוכחית: הגרסה היוצאת נשמרת עם reviewId, והנכנסת יוצאת מההיסטוריה. */
export function nextVersions(plugin, incomingVersion, now) {
  const currentReview = plugin.serviceState?.currentPluginReview
  const kept = (plugin.versions || []).filter((v) => v.version !== incomingVersion && (!currentReview || v.version !== plugin.version))
  if (!currentReview) return kept
  return [...kept, {
    version: plugin.version,
    pluginFileName: plugin.pluginFileName || PLUGIN_FILE_NAME,
    pluginFileExt: plugin.pluginFileExt || PLUGIN_FILE_EXT,
    pluginFileSize: plugin.pluginFileSize || 0,
    pluginFileSha256: plugin.pluginFileSha256 || null,
    status: plugin.status || 'stable',
    compatibleWith: plugin.compatibleWith || '',
    maxAppVersion: plugin.maxAppVersion ?? null,
    requiresNetwork: plugin.requiresNetwork === true,
    shortDescription: plugin.shortDescription || '',
    description: plugin.description || '',
    reviewId: currentReview,
    archivedAt: now,
  }]
}

function serviceFieldsOf(review) {
  return {
    'serviceState.platforms': platformsOf(review),
    'serviceState.ports': portsOf(review),
    'serviceState.serviceVersion': review.serviceVersion,
    'serviceState.uninstall': review.uninstall,
  }
}

const rangeOf = (review) => ({ min: review.serviceRange?.min ?? null, max: review.serviceRange?.max ?? null })

/** הוכחת פרסום: ההגשה מוצבעת מ-Plugin (נוכחית/קודמת) או שמורה בהיסטוריית הגרסאות. */
export function isReviewPublishedIn(plugin, reviewId) {
  const s = plugin?.serviceState
  if (!s) return false
  if ([s.currentPluginReview, s.currentServiceReview, s.previousServiceReview].some((id) => sameId(id, reviewId))) return true
  return (plugin.versions || []).some((v) => sameId(v.reviewId, reviewId))
}

async function markApproved(review, publishedAt) {
  const res = await ServicePluginReview.updateOne(
    { _id: review._id, status: { $in: ACTIVE_STATUSES } },
    { $set: { status: 'approved', publishedAt, activeKey: null, nextAttemptAt: null, lease: CLEARED_LEASE } },
  )
  await releaseScanLock(review._id)
  await syncPortReservations(review.pluginId)
  return res.modifiedCount === 1
}

function refreshPublicCaches() {
  try {
    revalidateNow(CACHE_TAGS.PLUGINS_PUBLIC)
  } catch (err) {
    console.error('[service-plugins] revalidate failed:', err?.message)
  }
  try {
    invalidatePluginSearchIndex()
  } catch { /* אינדקס בזיכרון בלבד */ }
}

async function notifyApproved(plugin, review) {
  try {
    const owner = plugin.authorId ? await User.findById(plugin.authorId).select('name email').lean() : null
    const result = await sendPluginApprovalNotification({
      recipientEmail: owner?.email || '',
      recipientName: owner?.name || plugin.author || '',
      pluginId: String(plugin._id),
      pluginName: plugin.name,
      version: review.pluginVersion,
      status: PLUGIN_STABILITY.includes(review.manifest?.stability) ? review.manifest.stability : 'stable',
      submissionType: plugin.serviceState?.currentPluginReview ? 'update' : 'new',
    })
    if (result?.sent) await ServicePluginReview.updateOne({ _id: review._id }, { $set: { emailSentAt: new Date() } })
  } catch (err) {
    console.error('[service-plugins] approval email failed:', err?.message)
  }
}

/**
 * פרסום: עדכון מותנה יחיד של Plugin (לא מוסתר/מושהה, אותה הגשה פעילה, אותו fence ואותה גרסת בסיס),
 * ואז סימון ההגשה כמאושרת. כשל בכתיבה השנייה משוחזר ב-finalizeIfPublished.
 * @returns {Promise<{ok:true, published:true}|{ok:false, status:number, code:string, message:string}>}
 */
export async function publishReview(review, { now = new Date() } = {}) {
  const plugin = await Plugin.findById(review.pluginId).lean()
  if (!plugin) return fail(404, 'plugin_missing', 'התוסף לא נמצא')
  const s = plugin.serviceState || {}
  const set = {
    ...pluginFieldsOf(review, plugin, now),
    isApproved: true,
    versions: nextVersions(plugin, review.pluginVersion, now),
    'serviceState.activeReviewId': null,
    'serviceState.currentPluginReview': review._id,
    'serviceState.serviceRange': rangeOf(review),
  }
  if (!plugin.approvedAt) Object.assign(set, { approvedBy: review.selectedBy ?? null, approvedAt: now })
  const addToSet = { 'serviceState.publishedPluginVersions': review.pluginVersion }
  if (review.kind === 'service') {
    Object.assign(set, serviceFieldsOf(review), {
      'serviceState.previousServiceReview': s.currentServiceReview ?? null,
      'serviceState.currentServiceReview': review._id,
    })
    addToSet['serviceState.publishedServiceVersions'] = review.serviceVersion
  }
  const res = await Plugin.updateOne(
    {
      _id: review.pluginId,
      hasService: true,
      isHidden: { $ne: true },
      isSuspended: { $ne: true },
      'serviceState.activeReviewId': review._id,
      'serviceState.activeFence': review.fence,
      'serviceState.currentPluginReview': review.baseCurrentPluginReview ?? null,
    },
    { $set: set, $addToSet: addToSet },
  )
  if (res.modifiedCount !== 1) {
    return fail(409, 'publish_conflict', 'לא ניתן לפרסם: התוסף הוסתר/הושהה, ההגשה בוטלה או שהגרסה הנוכחית השתנתה מאז תחילת הבדיקה')
  }
  await markApproved(review, now)
  refreshPublicCaches()
  await notifyApproved(plugin, review)
  return { ok: true, published: true }
}

/**
 * אם ההגשה כבר פורסמה (המצביע עודכן) אך הסטטוס שלה לא — מסמן אותה מאושרת, בלי להריץ דבר מחדש.
 * ההוכחה היא מצביעי Plugin בלבד: decision בעותק שבידי הקורא עשוי להיות ישן.
 */
export async function finalizeIfPublished(review, { now = new Date() } = {}) {
  if (review.status === 'approved') return { published: true, finalized: false }
  const plugin = await Plugin.findById(review.pluginId).select('serviceState versions').lean()
  if (!isReviewPublishedIn(plugin, review._id)) return { published: false, finalized: false }
  const finalized = await markApproved(review, review.publishedAt || now)
  return { published: true, finalized }
}

/** חזרה לגרסת השירות הקודמת יחד עם התוסף הכלול בה. אינה צורכת בדיקה ואינה מאפסת את 21 הימים. */
export async function rollback({ plugin, now = new Date() }) {
  if (!plugin?.hasService) return fail(409, 'not_service_plugin', 'התוסף אינו תוסף שירות')
  const s = plugin.serviceState || {}
  if (s.activeReviewId) return fail(409, 'active_review_exists', 'לתוסף יש הגשה פעילה. יש לבטל אותה לפני חזרה לגרסה הקודמת')
  if (!s.currentServiceReview || !s.previousServiceReview) return fail(409, 'no_previous', 'אין גרסת שירות קודמת לחזור אליה')
  const prev = await ServicePluginReview.findOne({ _id: s.previousServiceReview, status: 'approved', kind: 'service' }).lean()
  if (!prev) return fail(409, 'no_previous', 'אין גרסת שירות קודמת לחזור אליה')
  const set = {
    ...pluginFieldsOf(prev, plugin, now),
    versions: nextVersions(plugin, prev.pluginVersion, now),
    ...serviceFieldsOf(prev),
    'serviceState.currentServiceReview': prev._id,
    'serviceState.previousServiceReview': null,
    'serviceState.currentPluginReview': prev._id,
    'serviceState.serviceRange': rangeOf(prev),
  }
  const res = await Plugin.updateOne(
    {
      _id: plugin._id,
      hasService: true,
      'serviceState.activeReviewId': null,
      'serviceState.currentServiceReview': s.currentServiceReview,
      'serviceState.previousServiceReview': s.previousServiceReview,
      'serviceState.currentPluginReview': s.currentPluginReview ?? null,
    },
    { $set: set },
  )
  if (res.modifiedCount !== 1) return fail(409, 'conflict', 'מצב התוסף השתנה בזמן הפעולה; רעננו ונסו שוב')
  await syncPortReservations(plugin._id)
  refreshPublicCaches()
  return { ok: true, currentServiceReview: String(prev._id), serviceVersion: prev.serviceVersion, pluginVersion: prev.pluginVersion }
}

export const canRollback = (plugin) => !!(plugin?.serviceState?.previousServiceReview && plugin.serviceState.currentServiceReview && !plugin.serviceState.activeReviewId)
