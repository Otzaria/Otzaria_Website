// מדיניות תוספי השירות: קבועים, ולידציה, digest ומכונת המצבים.
// טהור לחלוטין (node built-ins בלבד) — המתווך (workers/service-plugin-broker) מייבא אותו בנתיב יחסי.
import { createHash } from 'node:crypto'

export const POLICY_VERSION = 2

const MiB = 1024 * 1024
export const LIMITS = Object.freeze({
  pluginBytes: 50 * MiB,
  installerBytes: 256 * MiB,
  maxInstallers: 8,
  maxSources: 4,
  reportBytes: 64 * 1024,
  maxActivePerDeveloper: 3,
  sourceTextBytes: 24 * MiB,
  sourceTextFiles: 5000,
  sourceFileBytes: 2 * MiB,
  jsonBodyBytes: 200_000,
  changeNotesChars: 2000,
  uninstallChars: 2000,
  reasonChars: 500,
})

export const SERVICE_COOLDOWN_DAYS = 21
export const LEASE_SECONDS = 120
export const RETRY_DELAYS_MS = Object.freeze([60_000, 300_000])
export const QUOTA_UNKNOWN_WAIT_MS = 6 * 3600_000 + 60_000
export const QUOTA_RESET_GRACE_MS = 60_000
export const MAX_UNKNOWN_QUOTA_WAITS = 2
export const STALL_TIMEOUT_MS = 10 * 60_000
// מועד איפוס מכסה רחוק מזה אינו אמין (מנוי שבועי לכל היותר).
const MAX_TRUSTED_RESET_MS = 8 * 24 * 3600_000

export const OS_IDS = Object.freeze(['windows', 'macos', 'linux', 'android'])
export const ARCH_IDS = Object.freeze(['x64', 'arm64', 'x86', 'universal'])
export const INSTALLER_EXTENSIONS = Object.freeze({
  windows: Object.freeze(['.exe', '.msi', '.zip']),
  macos: Object.freeze(['.dmg', '.pkg', '.zip']),
  linux: Object.freeze(['.appimage', '.deb', '.rpm', '.zip']),
  android: Object.freeze(['.apk']),
})
export const NATIVE_KEYS = Object.freeze(Array.from({ length: LIMITS.maxInstallers }, (_, i) => `native${i}`))
export const ASSET_KEYS = Object.freeze(['plugin', ...NATIVE_KEYS])

export const STATUSES = Object.freeze([
  'draft', 'sealing', 'pending_admin', 'queued', 'running', 'retry_wait', 'waiting_quota', 'needs_operator',
  'approved', 'rejected', 'cancelled',
])
export const TERMINAL_STATUSES = Object.freeze(['approved', 'rejected', 'cancelled'])
export const ACTIVE_STATUSES = Object.freeze(STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s)))
export const OWNER_CANCELLABLE = Object.freeze(['draft', 'pending_admin'])
// מצבים שבהם בודק עשוי להחזיק את ההגשה (ביטול בהם דורש הפקעת lease).
export const CLAIMABLE_STATUSES = Object.freeze(['queued', 'retry_wait', 'waiting_quota'])

export const REQUIRED_RECEIPTS = Object.freeze({
  service: Object.freeze(['hashes', 'clamav', 'release', 'extract', 'attestation', 'virustotal', 'source', 'prescan', 'claude']),
  plugin: Object.freeze(['hashes', 'clamav', 'virustotal', 'source', 'prescan', 'claude']),
})
export const RECEIPT_STAGES = Object.freeze([...REQUIRED_RECEIPTS.service])
export const FAILURE_CLASSES = Object.freeze(['transient', 'quota', 'operator'])

const TRANSITIONS = {
  draft: ['sealing', 'cancelled'],
  sealing: ['pending_admin', 'draft', 'cancelled'],
  pending_admin: ['queued', 'cancelled'],
  queued: ['running', 'cancelled'],
  // running→running: בודק אחר תופס הגשה שה-lease שלה פג
  running: ['running', 'approved', 'rejected', 'retry_wait', 'waiting_quota', 'needs_operator', 'cancelled'],
  retry_wait: ['running', 'cancelled'],
  waiting_quota: ['running', 'cancelled'],
  needs_operator: ['queued', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
}

export function canTransition(from, to) {
  return Object.prototype.hasOwnProperty.call(TRANSITIONS, from) && TRANSITIONS[from].includes(to)
}

// ------------------------------------------------------------------ versions

const VERSION_PART = /^(0|[1-9]\d{0,5})$/

/** 'X.Y.Z' → [x,y,z] או null. ספרות בלבד, בלי אפסים מובילים, כל חלק ≤ 999999. */
export function parseVersion(value) {
  if (typeof value !== 'string' || value.length > 20) return null
  const parts = value.split('.')
  if (parts.length !== 3 || !parts.every((p) => VERSION_PART.test(p))) return null
  return parts.map(Number)
}

export function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) throw new TypeError('invalid version')
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

export function isValidRange(range) {
  if (!range || typeof range !== 'object') return false
  if (!parseVersion(range.min)) return false
  if (range.max === null || range.max === undefined) return true
  return !!parseVersion(range.max) && compareVersions(range.min, range.max) <= 0
}

/** max null = ללא תקרה. */
export function versionInRange(version, range) {
  if (!parseVersion(version) || !isValidRange(range)) return false
  if (compareVersions(version, range.min) < 0) return false
  return range.max === null || range.max === undefined || compareVersions(version, range.max) <= 0
}

// ------------------------------------------------------------------ sources

const OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/

export function isValidRepository(value) {
  if (typeof value !== 'string') return false
  const parts = value.split('/')
  if (parts.length !== 2) return false
  const [owner, repo] = parts
  return OWNER_RE.test(owner) && REPO_RE.test(repo) && repo !== '.' && repo !== '..'
}

export function isValidCommit(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

/** רק https://github.com/<o>/<r>/releases/download/<tag>/<name> */
export function parseReleaseUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) return null
  if (url.search || url.hash) return null
  const segments = url.pathname.split('/')
  if (segments.length !== 7 || segments[0] !== '' || segments[3] !== 'releases' || segments[4] !== 'download') return null
  let tag
  let name
  try {
    tag = decodeURIComponent(segments[5])
    name = decodeURIComponent(segments[6])
  } catch {
    return null
  }
  const [, owner, repo] = segments
  if (!isValidRepository(`${owner}/${repo}`) || !isSafeName(tag, 255) || !isSafeName(name, 255)) return null
  return { owner, repo, tag, name }
}

const hasControlChars = (s) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return true
  }
  return false
}

function isSafeName(value, max) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !hasControlChars(value) &&
    !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..'
}

function isSafeText(value, max, multiline = false) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max &&
    !hasControlChars(multiline ? value.replace(/[\t\r\n]/g, '') : value)
}

/** נתיב יחסי בתוך המתקין, מופרד ב-'/', בלי '..' ובלי נתיב מוחלט. */
export function isValidBundledPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500 || hasControlChars(value)) return false
  if (value.includes('\\') || value.includes(':') || value.startsWith('/')) return false
  const segments = value.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return false
  return value.toLowerCase().endsWith('.otzplugin')
}

const isInt = (v) => typeof v === 'number' && Number.isInteger(v)
const lower = (s) => String(s).toLowerCase()

// ------------------------------------------------------------------ draft request

/**
 * ולידציה ונרמול של בקשת הגשה (מבנה הבקשה במדריך המפתח).
 * @param {object} body
 * @param {{pluginUid?:string, currentPluginVersion?:string|null, currentServiceVersion?:string|null,
 *   currentServiceRange?:object|null, hasApprovedService?:boolean, publishedPluginVersions?:string[],
 *   publishedServiceVersions?:string[]}} ctx
 * @returns {{ok:true, value:object}|{ok:false, errors:string[]}}
 */
export function validateDraftRequest(body, ctx = {}) {
  const errors = []
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['גוף הבקשה אינו תקין'] }
  const kind = body.kind
  if (kind !== 'service' && kind !== 'plugin') return { ok: false, errors: ['סוג ההגשה חייב להיות service או plugin'] }

  const publishedPlugin = new Set(ctx.publishedPluginVersions || [])
  const publishedService = new Set(ctx.publishedServiceVersions || [])

  const pluginVersion = body.pluginVersion
  if (!parseVersion(pluginVersion)) {
    errors.push('גרסת התוסף חייבת להיות בפורמט X.Y.Z')
  } else if (publishedPlugin.has(pluginVersion)) {
    errors.push(`גרסת התוסף ${pluginVersion} כבר פורסמה בעבר; אין שימוש חוזר במספר גרסה`)
  } else if (parseVersion(ctx.currentPluginVersion) && compareVersions(pluginVersion, ctx.currentPluginVersion) <= 0) {
    errors.push(`גרסת התוסף חייבת להיות גבוהה מהגרסה הנוכחית (${ctx.currentPluginVersion})`)
  }

  const pluginSize = body.pluginSize
  if (!isInt(pluginSize) || pluginSize < 1 || pluginSize > LIMITS.pluginBytes) {
    errors.push(`גודל קובץ התוסף חייב להיות מספר שלם בין 1 ל-${LIMITS.pluginBytes} בתים`)
  }

  const serviceRange = body.serviceRange && typeof body.serviceRange === 'object'
    ? { min: body.serviceRange.min, max: body.serviceRange.max ?? null }
    : null
  if (!serviceRange || !isValidRange(serviceRange)) {
    errors.push('טווח גרסאות השירות אינו תקין (נדרש מינימום X.Y.Z, ומקסימום שאינו נמוך ממנו או ללא תקרה)')
  }

  const sources = []
  if (!Array.isArray(body.sources) || body.sources.length < 1 || body.sources.length > LIMITS.maxSources) {
    errors.push(`יש לצרף בין 1 ל-${LIMITS.maxSources} מאגרי מקור`)
  } else {
    const seen = new Set()
    body.sources.forEach((s, i) => {
      const repository = s?.repository
      const commit = s?.commit
      if (!isValidRepository(repository)) errors.push(`מקור ${i + 1}: שם המאגר חייב להיות בפורמט owner/repository`)
      if (!isValidCommit(commit)) errors.push(`מקור ${i + 1}: נדרש commit מלא של 40 תווים הקסדצימליים קטנים`)
      if (isValidRepository(repository)) {
        if (seen.has(lower(repository))) errors.push(`המאגר ${repository} הופיע יותר מפעם אחת`)
        seen.add(lower(repository))
      }
      sources.push({ repository, commit })
    })
  }

  let changeNotes = ''
  if (body.changeNotes !== undefined && body.changeNotes !== null) {
    if (typeof body.changeNotes !== 'string' || body.changeNotes.length > LIMITS.changeNotesChars) {
      errors.push(`הערות השינוי מוגבלות ל-${LIMITS.changeNotesChars} תווים`)
    } else {
      changeNotes = body.changeNotes.trim()
    }
  }

  if (body.virusTotalConsent !== undefined && typeof body.virusTotalConsent !== 'boolean') {
    errors.push('הסכמה ל-VirusTotal חייבת להיות true או false')
  }
  const virusTotalConsent = body.virusTotalConsent === true

  const value = {
    kind,
    pluginVersion,
    pluginSize,
    serviceVersion: null,
    serviceRange,
    sources,
    changeNotes,
    uninstall: null,
    virusTotalConsent,
    assets: [],
  }

  if (kind === 'service') {
    validateServiceFields(body, ctx, publishedService, serviceRange, sources, value, errors)
  } else {
    if (body.serviceVersion !== undefined && body.serviceVersion !== null) errors.push('בעדכון תוסף בלבד אין לציין גרסת שירות')
    if (body.assets !== undefined && body.assets !== null) errors.push('בעדכון תוסף בלבד אין לצרף מתקינים')
    if (body.uninstall !== undefined && body.uninstall !== null) errors.push('בעדכון תוסף בלבד אין לשנות את הוראות ההסרה')
    if (!ctx.hasApprovedService) {
      errors.push('עדכון תוסף בלבד אפשרי רק אחרי שפורסם שירות מאושר')
    } else if (serviceRange && isValidRange(serviceRange) && !versionInRange(ctx.currentServiceVersion, serviceRange)) {
      errors.push(`גרסת השירות הנוכחית (${ctx.currentServiceVersion}) אינה בטווח שהוצהר לתוסף`)
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value }
}

function validateServiceFields(body, ctx, publishedService, serviceRange, sources, value, errors) {
  const serviceVersion = body.serviceVersion
  if (!parseVersion(serviceVersion)) {
    errors.push('גרסת השירות חייבת להיות בפורמט X.Y.Z')
  } else if (publishedService.has(serviceVersion)) {
    errors.push(`גרסת השירות ${serviceVersion} כבר פורסמה בעבר; אין שימוש חוזר במספר גרסה`)
  } else if (parseVersion(ctx.currentServiceVersion) && compareVersions(serviceVersion, ctx.currentServiceVersion) <= 0) {
    errors.push(`גרסת השירות חייבת להיות גבוהה מהגרסה הנוכחית (${ctx.currentServiceVersion})`)
  } else if (serviceRange && isValidRange(serviceRange) && !versionInRange(serviceVersion, serviceRange)) {
    errors.push('גרסת השירות שבהגשה חייבת להיות בתוך טווח התאימות של התוסף')
  }
  value.serviceVersion = serviceVersion

  if (!isSafeText(body.uninstall, LIMITS.uninstallChars, true)) {
    errors.push(`יש לכתוב הוראות הסרה (עד ${LIMITS.uninstallChars} תווים)`)
  } else {
    value.uninstall = body.uninstall.trim()
  }

  const assets = body.assets
  if (!Array.isArray(assets) || assets.length < 1 || assets.length > LIMITS.maxInstallers) {
    errors.push(`יש לצרף בין 1 ל-${LIMITS.maxInstallers} מתקינים`)
    return
  }
  const sourceRepos = new Set(sources.filter((s) => isValidRepository(s.repository)).map((s) => lower(s.repository)))
  const combos = new Set()
  const portByOs = new Map()
  assets.forEach((a, i) => {
    const label = `מתקין ${i + 1}`
    if (!a || typeof a !== 'object') {
      errors.push(`${label}: נתונים חסרים`)
      return
    }
    const { name, size, os, arch, minOs, port, bundledPluginPath, releaseUrl } = a
    if (!OS_IDS.includes(os)) errors.push(`${label}: מערכת הפעלה לא נתמכת (${OS_IDS.join(', ')})`)
    if (!ARCH_IDS.includes(arch)) errors.push(`${label}: ארכיטקטורה לא נתמכת (${ARCH_IDS.join(', ')})`)
    if (!isSafeName(name, 200)) {
      errors.push(`${label}: שם הקובץ אינו תקין`)
    } else if (OS_IDS.includes(os) && !INSTALLER_EXTENSIONS[os].some((ext) => lower(name).endsWith(ext))) {
      errors.push(`${label}: סיומת הקובץ אינה מותרת עבור ${os} (${INSTALLER_EXTENSIONS[os].join(', ')})`)
    }
    if (!isInt(size) || size < 1 || size > LIMITS.installerBytes) {
      errors.push(`${label}: הגודל חייב להיות מספר שלם בין 1 ל-${LIMITS.installerBytes} בתים`)
    }
    if (!isSafeText(minOs, 100)) errors.push(`${label}: יש לציין גרסת מערכת מינימלית`)
    if (!isInt(port) || port < 1024 || port > 65535) {
      errors.push(`${label}: פורט הזיהוי חייב להיות מספר שלם בין 1024 ל-65535`)
    } else if (OS_IDS.includes(os)) {
      if (portByOs.has(os) && portByOs.get(os) !== port) errors.push(`${label}: לכל המתקינים של ${os} חייב להיות אותו פורט זיהוי`)
      if (!portByOs.has(os)) portByOs.set(os, port)
    }
    if (!isValidBundledPath(bundledPluginPath)) {
      errors.push(`${label}: נתיב התוסף בתוך המתקין חייב להיות נתיב יחסי לקובץ .otzplugin`)
    }
    const release = parseReleaseUrl(releaseUrl)
    if (!release) {
      errors.push(`${label}: קישור ה-Release חייב להיות https://github.com/<owner>/<repo>/releases/download/<tag>/<file>`)
    } else if (!sourceRepos.has(lower(`${release.owner}/${release.repo}`))) {
      errors.push(`${label}: קישור ה-Release חייב להיות מאחד ממאגרי המקור שהוגשו`)
    }
    const combo = `${os}/${arch}`
    if (combos.has(combo)) errors.push(`${label}: כבר צורף מתקין עבור ${combo}`)
    combos.add(combo)
    value.assets.push({
      key: NATIVE_KEYS[i],
      name: typeof name === 'string' ? name : '',
      size,
      os,
      arch,
      minOs: typeof minOs === 'string' ? minOs.trim() : '',
      port,
      bundledPluginPath,
      releaseUrl,
    })
  })
}

// ------------------------------------------------------------------ digest

/** JSON קנוני: מפתחות ממוינים ברקורסיה, בלי רווחים; undefined במפתח של אובייקט מושמט. */
export function canonicalJson(value) {
  if (value === null) return 'null'
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value)
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('non-finite number')
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`
      // ObjectId וכדומה: מיוצגים כמחרוזת
      if (typeof value.toHexString === 'function') return JSON.stringify(value.toHexString())
      const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort()
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`
    }
    default:
      throw new TypeError(`unsupported type ${typeof value}`)
  }
}

const orNull = (v) => (v === undefined ? null : v)

/** זהות ההגשה: sha256 של כל ה-hashes, המקורות, התאימות, המניפסט וגרסת המדיניות. */
export function submissionDigest(review) {
  const payload = {
    policyVersion: review.policyVersion,
    pluginId: String(review.pluginId),
    kind: review.kind,
    pluginVersion: review.pluginVersion,
    serviceVersion: orNull(review.serviceVersion),
    serviceRange: review.serviceRange ? { min: review.serviceRange.min, max: orNull(review.serviceRange.max) } : null,
    sources: (review.sources || []).map((s) => ({ repository: s.repository, commit: s.commit })),
    uninstall: orNull(review.uninstall),
    virusTotalConsent: review.virusTotalConsent === true,
    plugin: { size: orNull(review.pluginAsset?.size), sha256: orNull(review.pluginAsset?.sha256) },
    assets: (review.assets || []).map((a) => ({
      key: a.key,
      name: a.name,
      size: a.size,
      sha256: orNull(a.sha256),
      os: a.os,
      arch: a.arch,
      minOs: a.minOs,
      port: a.port,
      bundledPluginPath: a.bundledPluginPath,
      releaseUrl: a.releaseUrl,
    })),
    manifest: orNull(review.manifest),
  }
  return createHash('sha256').update(canonicalJson(payload)).digest('hex')
}

// ------------------------------------------------------------------ scheduling

/** attempts = מספר הכשלים הזמניים כולל הנוכחי. */
export function nextAfterTransientFailure(attempts, now = new Date()) {
  if (!isInt(attempts) || attempts < 1 || attempts > RETRY_DELAYS_MS.length) return { status: 'needs_operator' }
  return { status: 'retry_wait', nextAttemptAt: new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]) }
}

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value)
  if (typeof value === 'string' && value) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** מכסת Claude: מועד איפוס אמין + דקה, אחרת 6 שעות + דקה; אחרי שתי המתנות לא ידועות — מפעיל. */
export function nextAfterQuota({ resetAt, unknownWaits = 0, now = new Date() } = {}) {
  const reset = toDate(resetAt)
  const delta = reset ? reset.getTime() - now.getTime() : -1
  if (reset && delta > 0 && delta < MAX_TRUSTED_RESET_MS) {
    return { status: 'waiting_quota', nextAttemptAt: new Date(reset.getTime() + QUOTA_RESET_GRACE_MS), unknownWaits }
  }
  const nextUnknown = (isInt(unknownWaits) ? unknownWaits : 0) + 1
  if (nextUnknown > MAX_UNKNOWN_QUOTA_WAITS) return { status: 'needs_operator' }
  return { status: 'waiting_quota', nextAttemptAt: new Date(now.getTime() + QUOTA_UNKNOWN_WAIT_MS), unknownWaits: nextUnknown }
}

export function cooldownState(lastServiceCycleStartedAt, now = new Date()) {
  const last = toDate(lastServiceCycleStartedAt)
  if (!last) return { blocked: false, nextAllowedAt: null }
  const nextAllowedAt = new Date(last.getTime() + SERVICE_COOLDOWN_DAYS * 24 * 3600_000)
  return { blocked: now.getTime() < nextAllowedAt.getTime(), nextAllowedAt }
}

/** שלבי חובה שאין להם קבלה של אותה הגשה (digest זהה) — פרסום מותר רק כשהרשימה ריקה. */
export function missingReceipts(review) {
  const required = REQUIRED_RECEIPTS[review?.kind] || REQUIRED_RECEIPTS.service
  const receipts = review?.receipts || []
  // קבלת דחייה של שלב קבוע אינה מעבר שלו, גם אם הגיעה החלטה 1
  return required.filter((stage) => !receipts.some((r) => r.stage === stage && !!review.manifestDigest && r.digest === review.manifestDigest
    && r.data?.rejected !== true))
}

/** תשובת הבודק: {decision:0|1, report} — report מחרוזת לא ריקה עד 64KiB. */
export function validateDecision(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'not_object' }
  if (obj.decision !== 0 && obj.decision !== 1) return { ok: false, error: 'invalid_decision' }
  if (typeof obj.report !== 'string' || !obj.report.trim()) return { ok: false, error: 'missing_report' }
  if (Buffer.byteLength(obj.report, 'utf8') > LIMITS.reportBytes) return { ok: false, error: 'report_too_large' }
  return { ok: true, decision: obj.decision, report: obj.report }
}
