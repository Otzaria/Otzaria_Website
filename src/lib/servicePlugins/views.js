// תצוגות JSON של תוספי השירות: ציבורית (הורדה וזיהוי), ניהול למפתח, ורשימת מנהל.
import Plugin from '../../models/Plugin.js'
import User from '../../models/User.js'
import ServicePluginReview from '../../models/ServicePluginReview.js'
import ServiceScanControl from '../../models/ServiceScanControl.js'
import { ACTIVE_STATUSES, TERMINAL_STATUSES, LIMITS, cooldownState } from './policy.js'
import { canRollback } from './publish.js'

const sameId = (a, b) => a != null && b != null && String(a) === String(b)
const rangeOf = (r) => ({ min: r?.min ?? null, max: r?.max ?? null })
export const DETECTION_PATH = '/.well-known/otzaria-service'

export function isPubliclyVisible(plugin) {
  return !!plugin && plugin.hasService === true && plugin.isApproved === true && plugin.isHidden !== true && plugin.isSuspended !== true
}

/** קובץ התוסף של ההגשה מוגש רק אם היא התוסף הנוכחי או גרסה שמורה בהיסטוריה. */
export function isPluginFileServable(plugin, reviewId) {
  const s = plugin?.serviceState || {}
  return sameId(s.currentPluginReview, reviewId) || (plugin?.versions || []).some((v) => sameId(v.reviewId, reviewId))
}

/** מתקינים מוגשים רק מהשירות הנוכחי והקודם. */
export function isNativeFileServable(plugin, reviewId) {
  const s = plugin?.serviceState || {}
  return sameId(s.currentServiceReview, reviewId) || sameId(s.previousServiceReview, reviewId)
}

const downloadUrl = (pluginId, reviewId, key) => `/api/service-plugins/${pluginId}/download/${reviewId}/${key}`

function publicPlatforms(pluginId, reviewId, platforms) {
  return (platforms || []).map((p) => ({
    os: p.os, arch: p.arch, minOs: p.minOs, port: p.port, name: p.name, size: p.size, sha256: p.sha256,
    downloadUrl: downloadUrl(pluginId, reviewId, p.fileKey),
  }))
}

export async function getPublicServiceInfo(pluginId) {
  const plugin = await Plugin.findById(pluginId)
    .select('name slug pluginUid version hasService isApproved isHidden isSuspended serviceState versions').lean()
  if (!isPubliclyVisible(plugin) || !plugin.serviceState?.currentServiceReview || !plugin.serviceState.currentPluginReview) return null
  const s = plugin.serviceState
  const pid = String(plugin._id)
  let previous = null
  if (s.previousServiceReview) {
    const prev = await ServicePluginReview.findById(s.previousServiceReview)
      .select('serviceVersion serviceRange pluginVersion uninstall assets').lean()
    if (prev) {
      previous = {
        reviewId: String(prev._id),
        serviceVersion: prev.serviceVersion,
        serviceRange: rangeOf(prev.serviceRange),
        pluginVersion: prev.pluginVersion,
        uninstall: prev.uninstall,
        pluginDownloadUrl: isPluginFileServable(plugin, prev._id) ? downloadUrl(pid, prev._id, 'plugin') : null,
        platforms: publicPlatforms(pid, prev._id, (prev.assets || []).map((a) => ({ ...a, fileKey: a.key }))),
      }
    }
  }
  return {
    pluginId: pid,
    pluginUid: plugin.pluginUid,
    name: plugin.name,
    slug: plugin.slug,
    detection: { path: DETECTION_PATH, protocolVersion: 1, serviceId: plugin.pluginUid },
    current: {
      reviewId: String(s.currentServiceReview),
      serviceVersion: s.serviceVersion,
      serviceRange: rangeOf(s.serviceRange),
      pluginVersion: plugin.version,
      uninstall: s.uninstall,
      pluginDownloadUrl: downloadUrl(pid, s.currentPluginReview, 'plugin'),
      platforms: publicPlatforms(pid, s.currentServiceReview, s.platforms),
    },
    previous,
  }
}

function reviewSummary(r) {
  const uploads = { plugin: !!r.pluginAsset?.receivedAt }
  for (const a of r.assets || []) uploads[a.key] = !!a.receivedAt
  return {
    id: String(r._id),
    kind: r.kind,
    status: r.status,
    pluginVersion: r.pluginVersion,
    serviceVersion: r.serviceVersion ?? null,
    serviceRange: rangeOf(r.serviceRange),
    createdAt: r.createdAt,
    selectedAt: r.selectedAt ?? null,
    decidedAt: r.decidedAt ?? null,
    decision: r.decision ?? null,
    report: r.report ?? null,
    lastErrorClass: r.lastError?.class ?? null,
    lastErrorMessage: r.lastError?.class === 'validation' ? r.lastError.message : null,
    pluginSize: r.pluginAsset?.size ?? null,
    uploads,
    assets: (r.assets || []).map((a) => ({
      key: a.key, name: a.name, size: a.size, os: a.os, arch: a.arch, minOs: a.minOs, port: a.port,
      bundledPluginPath: a.bundledPluginPath, releaseUrl: a.releaseUrl,
    })),
  }
}

export async function getManageView(plugin, { enabled }) {
  const s = plugin.serviceState || {}
  const reviews = await ServicePluginReview.find({ pluginId: plugin._id })
    .sort({ createdAt: -1 }).limit(20)
    .select('-receipts -manifest -lease').lean()
  return {
    plugin: {
      id: String(plugin._id), name: plugin.name, slug: plugin.slug, pluginUid: plugin.pluginUid,
      isApproved: plugin.isApproved === true, hasService: plugin.hasService === true,
    },
    enabled,
    limits: LIMITS,
    cooldown: cooldownState(s.lastServiceCycleStartedAt),
    adminException: !!s.adminException,
    canRollback: canRollback(plugin),
    current: {
      pluginVersion: s.currentPluginReview ? plugin.version : null,
      serviceVersion: s.currentServiceReview ? s.serviceVersion : null,
      serviceRange: s.currentPluginReview ? rangeOf(s.serviceRange) : null,
      platforms: (s.platforms || []).map((p) => ({ os: p.os, arch: p.arch, minOs: p.minOs, port: p.port, name: p.name, size: p.size })),
    },
    reviews: reviews.map(reviewSummary),
  }
}

export async function getAdminView() {
  const [control, active, terminal] = await Promise.all([
    ServiceScanControl.findOne({ key: 'global' }).lean(),
    ServicePluginReview.find({ status: { $in: ACTIVE_STATUSES } }).sort({ selectedAt: 1, createdAt: 1 })
      .select('-receipts -manifest -lease -report').lean(),
    ServicePluginReview.find({ status: { $in: TERMINAL_STATUSES } }).sort({ updatedAt: -1 }).limit(30)
      .select('-receipts -manifest -lease -report').lean(),
  ])
  const reviews = [...active, ...terminal]
  const pluginIds = [...new Set(reviews.map((r) => String(r.pluginId)))]
  const ownerIds = [...new Set(reviews.map((r) => String(r.ownerId)))]
  const [plugins, owners] = await Promise.all([
    Plugin.find({ _id: { $in: pluginIds } }).select('name slug serviceState').lean(),
    User.find({ _id: { $in: ownerIds } }).select('name').lean(),
  ])
  const pluginById = new Map(plugins.map((p) => [String(p._id), p]))
  const ownerById = new Map(owners.map((u) => [String(u._id), u]))
  const lock = control?.lock
  return {
    control: {
      quotaPausedUntil: control?.quotaPausedUntil ?? null,
      lock: lock?.expiresAt && lock.expiresAt > new Date() ? { reviewId: lock.reviewId ? String(lock.reviewId) : null, expiresAt: lock.expiresAt } : null,
    },
    reviews: reviews.map((r) => {
      const plugin = pluginById.get(String(r.pluginId))
      const s = plugin?.serviceState || {}
      return {
        id: String(r._id),
        pluginId: String(r.pluginId),
        pluginName: plugin?.name ?? null,
        pluginSlug: plugin?.slug ?? null,
        kind: r.kind,
        status: r.status,
        pluginVersion: r.pluginVersion,
        serviceVersion: r.serviceVersion ?? null,
        ownerName: ownerById.get(String(r.ownerId))?.name ?? null,
        createdAt: r.createdAt,
        selectedAt: r.selectedAt ?? null,
        attempts: r.attempts || 0,
        nextAttemptAt: r.nextAttemptAt ?? null,
        lastError: r.lastError ? { class: r.lastError.class, code: r.lastError.code, message: r.lastError.message } : null,
        decision: r.decision ?? null,
        cooldown: r.status === 'pending_admin' && sameId(s.cycleStart?.reviewId, r._id)
          ? { blocked: false, nextAllowedAt: null }
          : cooldownState(s.lastServiceCycleStartedAt),
        adminException: !!s.adminException,
        canRollback: canRollback(plugin),
      }
    }),
  }
}
