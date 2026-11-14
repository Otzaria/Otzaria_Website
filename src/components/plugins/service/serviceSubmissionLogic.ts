// לוגיקה טהורה של דף הגשת השירות (/plugins/<id>/service): מבנה GET .../manage, תוויות מצב, בדיקה
// מקדימה של הטופס (אותם כללים כמו validateDraftRequest בשרת — השרת הוא המחייב) ובניית הבקשות.
// טסט: serviceSubmissionLogic.test.ts.
import type { BadgeTone } from '@/components/ui/Badge'
import { hasAllowedExtension, isServiceArch, isServiceOs, osLabel, type ServiceArch, type ServiceOs } from './servicePlatforms'
import { compareVersions, isValidVersion, versionInRange, type ServiceRange } from './serviceVersion'

export const REVIEW_STATUSES = [
  'draft', 'sealing', 'pending_admin', 'queued', 'running', 'retry_wait', 'waiting_quota',
  'needs_operator', 'approved', 'rejected', 'cancelled'
] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]
export type SubmissionKind = 'service' | 'plugin'

export const STATUS_META: Record<ReviewStatus, { label: string; tone: BadgeTone; icon: string }> = {
  draft: { label: 'טיוטה — ההעלאה לא הושלמה', tone: 'neutral', icon: 'edit_note' },
  sealing: { label: 'בהקפאה', tone: 'neutral', icon: 'lock' },
  pending_admin: { label: 'ממתין לבחירת מנהל', tone: 'info', icon: 'schedule' },
  queued: { label: 'בתור לבדיקה', tone: 'info', icon: 'hourglass_top' },
  running: { label: 'בבדיקה', tone: 'info', icon: 'sync' },
  retry_wait: { label: 'ממתין לניסיון חוזר', tone: 'warning', icon: 'restart_alt' },
  waiting_quota: { label: 'ממתין לחידוש מכסת הבדיקה', tone: 'warning', icon: 'pending' },
  needs_operator: { label: 'תקלה תפעולית', tone: 'warning', icon: 'warning' },
  approved: { label: 'אושר ופורסם', tone: 'success', icon: 'check_circle' },
  rejected: { label: 'נדחה', tone: 'error', icon: 'cancel' },
  cancelled: { label: 'בוטל', tone: 'neutral', icon: 'block' }
}

export function statusMeta(status: string) {
  return STATUS_META[status as ReviewStatus] ?? { label: status, tone: 'neutral' as BadgeTone, icon: 'help' }
}

export const KIND_LABELS: Record<SubmissionKind, string> = {
  service: 'שירות ותוסף',
  plugin: 'עדכון תוסף בלבד'
}

export const OWNER_CANCELLABLE: readonly string[] = ['draft', 'pending_admin']
export const TERMINAL_STATUSES: readonly string[] = ['approved', 'rejected', 'cancelled']

export interface ServiceLimits {
  pluginBytes: number
  installerBytes: number
  maxInstallers: number
  maxSources: number
  changeNotesChars: number
  uninstallChars: number
}

export const DEFAULT_LIMITS: ServiceLimits = {
  pluginBytes: 50 * 1024 * 1024,
  installerBytes: 256 * 1024 * 1024,
  maxInstallers: 8,
  maxSources: 4,
  changeNotesChars: 2000,
  uninstallChars: 2000
}

export function resolveLimits(limits: Partial<ServiceLimits> | null | undefined): ServiceLimits {
  return { ...DEFAULT_LIMITS, ...(limits || {}) }
}

export interface DeclaredAsset {
  key?: string
  name: string
  size: number
  os: string
  arch: string
  minOs?: string
  port?: number
}

export interface ManageReview {
  id: string
  kind: SubmissionKind
  status: ReviewStatus | string
  pluginVersion: string
  serviceVersion: string | null
  createdAt: string
  selectedAt: string | null
  decidedAt: string | null
  decision: 0 | 1 | null
  report: string | null
  lastErrorClass: string | null
  /** רק לשגיאת נתונים (למשל הקפאה שנכשלה בבדיקת ה-SDK) — הודעה בעברית מהשרת */
  lastErrorMessage?: string | null
  uploads: Record<string, boolean>
  assets: DeclaredAsset[]
}

export interface ManageCurrent {
  pluginVersion: string | null
  serviceVersion: string | null
  serviceRange: ServiceRange | null
  platforms: DeclaredAsset[]
}

export interface ManageResponse {
  plugin: { id: string; name: string; slug: string; pluginUid: string; isApproved: boolean; hasService: boolean }
  enabled: boolean
  /** הגשה, ביטול וחזרה לאחור — לבעלים בלבד; מנהל תוספים רואה את הדף לקריאה */
  viewerIsOwner?: boolean
  limits: Partial<ServiceLimits>
  cooldown: { blocked: boolean; nextAllowedAt: string | null }
  adminException: boolean
  canRollback: boolean
  current: ManageCurrent | null
  reviews: ManageReview[]
}

/** הגשה פעילה (לא סופית) — לכל תוסף מותרת אחת בלבד */
export function activeReview(reviews: ManageReview[]): ManageReview | null {
  return reviews.find((r) => !TERMINAL_STATUSES.includes(r.status)) ?? null
}

/** עדכון תוסף בלבד אפשרי רק כשיש שירות מאושר */
export function hasApprovedService(current: ManageCurrent | null | undefined): boolean {
  return Boolean(current?.serviceVersion)
}

// ---------- הטופס ----------

export interface InstallerRow {
  rowId: string
  file: File | null
  os: ServiceOs | ''
  arch: ServiceArch | ''
  minOs: string
  port: string
  bundledPluginPath: string
  releaseUrl: string
}

export interface SourceRow {
  rowId: string
  repository: string
  commit: string
}

export interface SubmissionForm {
  kind: SubmissionKind
  pluginVersion: string
  serviceVersion: string
  rangeMin: string
  rangeMax: string
  noCeiling: boolean
  sources: SourceRow[]
  installers: InstallerRow[]
  uninstall: string
  changeNotes: string
  virusTotalConsent: boolean
}

let rowCounter = 0
const nextRowId = (prefix: string) => `${prefix}-${++rowCounter}`

export function emptyInstallerRow(): InstallerRow {
  return { rowId: nextRowId('installer'), file: null, os: '', arch: '', minOs: '', port: '', bundledPluginPath: 'plugin.otzplugin', releaseUrl: '' }
}

export function emptySourceRow(): SourceRow {
  return { rowId: nextRowId('source'), repository: '', commit: '' }
}

/** מצב התחלתי: הגשת שירות, או עדכון תוסף כשכבר יש שירות מאושר; הטווח וההסרה מהגרסה הנוכחית */
export function initialSubmissionForm(current: ManageCurrent | null | undefined): SubmissionForm {
  return {
    kind: 'service',
    pluginVersion: '',
    serviceVersion: '',
    rangeMin: current?.serviceRange?.min ?? '',
    rangeMax: current?.serviceRange?.max ?? '',
    noCeiling: false,
    sources: [emptySourceRow()],
    installers: [emptyInstallerRow()],
    uninstall: '',
    changeNotes: '',
    virusTotalConsent: false
  }
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/
const COMMIT_RE = /^[0-9a-f]{40}$/

export function isValidRepository(value: string): boolean {
  const parts = value.split('/')
  if (parts.length !== 2) return false
  const [owner, repo] = parts
  return OWNER_RE.test(owner) && REPO_RE.test(repo) && repo !== '.' && repo !== '..'
}

export function normalizeCommit(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidCommit(value: string): boolean {
  return COMMIT_RE.test(value)
}

/** רק https://github.com/<owner>/<repo>/releases/download/<tag>/<name> */
export function parseReleaseUrl(value: string): { owner: string; repo: string; tag: string; name: string } | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.search || url.hash || url.port) return null
  const parts = url.pathname.split('/')
  // ['', owner, repo, 'releases', 'download', tag, name]
  if (parts.length !== 7 || parts[3] !== 'releases' || parts[4] !== 'download') return null
  const [, owner, repo, , , tag, name] = parts
  if (!owner || !repo || !tag || !name || !isValidRepository(`${owner}/${repo}`)) return null
  return { owner, repo, tag: decodeURIComponent(tag), name: decodeURIComponent(name) }
}

function sourcesRepoSet(sources: SourceRow[]): Set<string> {
  return new Set(sources.map((s) => s.repository.trim().toLowerCase()).filter(Boolean))
}

/** נתיב יחסי בתוך המתקין, מופרד ב-'/', בלי '..' ובלי נתיב מוחלט, לקובץ .otzplugin */
export function isValidBundledPath(value: string): boolean {
  if (!value || value.length > 500 || value.includes('\\') || value.includes(':') || value.startsWith('/')) return false
  if (value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) return false
  return value.toLowerCase().endsWith('.otzplugin')
}

export interface ValidationContext {
  pluginUid: string
  current: ManageCurrent | null | undefined
  limits: ServiceLimits
  pluginFile: Pick<File, 'name' | 'size'> | null
  /** manifest.json של קובץ התוסף שנבחר (null — לא נקרא) */
  manifest: { id: string; version: string } | null
}

/**
 * בדיקה מקדימה — רשימת הודעות בעברית (ריקה = אפשר לשלוח). אותם כללים כמו בשרת; השרת בודק שוב
 * ומחזיר שגיאות משלו (למשל פורט שתפוס בידי תוסף אחר, גרסה שכבר פורסמה).
 */
export function validateSubmissionForm(form: SubmissionForm, ctx: ValidationContext): string[] {
  const errors: string[] = []
  const { limits, current } = ctx

  if (!ctx.pluginFile) errors.push('יש לבחור את קובץ התוסף (.otzplugin)')
  else {
    if (!ctx.pluginFile.name.toLowerCase().endsWith('.otzplugin')) errors.push('קובץ התוסף חייב להיות בפורמט .otzplugin')
    if (ctx.pluginFile.size <= 0 || ctx.pluginFile.size > limits.pluginBytes) {
      errors.push(`קובץ התוסף חייב להיות עד ${Math.round(limits.pluginBytes / 1024 / 1024)} MiB`)
    }
    if (ctx.manifest && ctx.manifest.id !== ctx.pluginUid) {
      errors.push(`מזהה התוסף בקובץ (${ctx.manifest.id}) שונה ממזהה התוסף בחנות (${ctx.pluginUid})`)
    }
    if (ctx.manifest && ctx.manifest.version !== form.pluginVersion.trim()) {
      errors.push('גרסת התוסף שבטופס שונה מהגרסה שבקובץ התוסף')
    }
  }

  const pluginVersion = form.pluginVersion.trim()
  if (!isValidVersion(pluginVersion)) errors.push('גרסת התוסף חייבת להיות בפורמט X.Y.Z')
  else if (current?.pluginVersion && (compareVersions(pluginVersion, current.pluginVersion) ?? 0) <= 0) {
    errors.push(`גרסת התוסף חייבת להיות גבוהה מהגרסה הנוכחית (${current.pluginVersion})`)
  }

  const range = rangeFromForm(form)
  if (!isValidVersion(range.min)) errors.push('גרסת השירות המינימלית בטווח חייבת להיות בפורמט X.Y.Z')
  else if (!form.noCeiling && !isValidVersion(form.rangeMax.trim())) {
    errors.push('יש להזין גרסת שירות מרבית בפורמט X.Y.Z, או לסמן "ללא תקרה"')
  } else if (range.max && (compareVersions(range.min, range.max) ?? 1) > 0) {
    errors.push('גרסת השירות המרבית בטווח חייבת להיות שווה למינימלית או גבוהה ממנה')
  }

  if (form.sources.length < 1) errors.push('יש לצרף לפחות מאגר מקור אחד')
  if (form.sources.length > limits.maxSources) errors.push(`ניתן לצרף עד ${limits.maxSources} מאגרי מקור`)
  const seenRepos = new Set<string>()
  form.sources.forEach((source, i) => {
    const n = i + 1
    const repository = source.repository.trim()
    if (!isValidRepository(repository)) errors.push(`מקור ${n}: יש להזין מאגר GitHub בפורמט owner/repository`)
    else if (seenRepos.has(repository.toLowerCase())) errors.push(`מקור ${n}: המאגר כבר מופיע ברשימה`)
    seenRepos.add(repository.toLowerCase())
    if (!isValidCommit(normalizeCommit(source.commit))) errors.push(`מקור ${n}: commit חייב להיות מזהה מלא בן 40 תווים הקסדצימליים`)
  })

  if (form.changeNotes.length > limits.changeNotesChars) errors.push(`תיאור השינויים ארוך מ-${limits.changeNotesChars} תווים`)

  if (form.kind === 'plugin') {
    if (!hasApprovedService(current)) errors.push('עדכון תוסף בלבד אפשרי רק אחרי שאושר שירות')
    else if (isValidVersion(range.min) && !versionInRange(current!.serviceVersion as string, range)) {
      errors.push(`גרסת השירות המאושרת (${current!.serviceVersion}) אינה בטווח שהוזן`)
    }
    return errors
  }

  const serviceVersion = form.serviceVersion.trim()
  if (!isValidVersion(serviceVersion)) errors.push('גרסת השירות חייבת להיות בפורמט X.Y.Z')
  else if (current?.serviceVersion && (compareVersions(serviceVersion, current.serviceVersion) ?? 0) <= 0) {
    errors.push(`גרסת השירות חייבת להיות גבוהה מהגרסה הנוכחית (${current.serviceVersion})`)
  } else if (isValidVersion(range.min) && (range.max === null || isValidVersion(range.max)) && !versionInRange(serviceVersion, range)) {
    errors.push('גרסת השירות שבהגשה חייבת להיות בתוך טווח התאימות של התוסף')
  }

  if (!form.uninstall.trim()) errors.push('יש לכתוב הוראות הסרה של השירות')
  else if (form.uninstall.length > limits.uninstallChars) errors.push(`הוראות ההסרה ארוכות מ-${limits.uninstallChars} תווים`)

  if (form.installers.length < 1) errors.push('יש לצרף לפחות מתקין אחד')
  if (form.installers.length > limits.maxInstallers) errors.push(`ניתן לצרף עד ${limits.maxInstallers} מתקינים`)

  const repos = sourcesRepoSet(form.sources)
  const combos = new Set<string>()
  const portByOs = new Map<string, string>()
  form.installers.forEach((row, i) => {
    const n = i + 1
    if (!row.file) errors.push(`מתקין ${n}: יש לבחור קובץ`)
    if (!isServiceOs(row.os)) errors.push(`מתקין ${n}: יש לבחור מערכת הפעלה`)
    if (!isServiceArch(row.arch)) errors.push(`מתקין ${n}: יש לבחור סוג מעבד`)
    if (isServiceOs(row.os) && isServiceArch(row.arch)) {
      const combo = `${row.os}/${row.arch}`
      if (combos.has(combo)) errors.push(`מתקין ${n}: כבר יש מתקין ל-${osLabel(row.os)} ${row.arch}`)
      combos.add(combo)
    }
    if (row.file && isServiceOs(row.os) && !hasAllowedExtension(row.file.name, row.os)) {
      errors.push(`מתקין ${n}: סוג הקובץ אינו מותר ל-${osLabel(row.os)}`)
    }
    if (row.file && (row.file.size <= 0 || row.file.size > limits.installerBytes)) {
      errors.push(`מתקין ${n}: הקובץ חייב להיות עד ${Math.round(limits.installerBytes / 1024 / 1024)} MiB`)
    }
    if (!row.minOs.trim()) errors.push(`מתקין ${n}: יש לציין גרסת מערכת מינימלית`)
    const port = Number(row.port)
    if (!/^\d+$/.test(row.port.trim()) || port < 1024 || port > 65535) {
      errors.push(`מתקין ${n}: פורט הזיהוי חייב להיות מספר בין 1024 ל-65535`)
    } else if (isServiceOs(row.os)) {
      const existing = portByOs.get(row.os)
      if (existing !== undefined && existing !== String(port)) {
        errors.push(`מתקין ${n}: לכל המתקינים של ${osLabel(row.os)} חייב להיות אותו פורט זיהוי`)
      }
      portByOs.set(row.os, String(port))
    }
    if (!isValidBundledPath(row.bundledPluginPath.trim())) {
      errors.push(`מתקין ${n}: נתיב התוסף בתוך המתקין חייב להיות נתיב יחסי לקובץ .otzplugin (למשל plugin.otzplugin)`)
    }
    const release = parseReleaseUrl(row.releaseUrl.trim())
    if (!release) {
      errors.push(`מתקין ${n}: קישור ה-Release חייב להיות בצורה https://github.com/owner/repo/releases/download/tag/file`)
    } else if (!repos.has(`${release.owner}/${release.repo}`.toLowerCase())) {
      errors.push(`מתקין ${n}: קישור ה-Release חייב להיות מאחד ממאגרי המקור שבהגשה`)
    }
  })

  return errors
}

export function rangeFromForm(form: Pick<SubmissionForm, 'rangeMin' | 'rangeMax' | 'noCeiling'>): ServiceRange {
  return { min: form.rangeMin.trim(), max: form.noCeiling ? null : form.rangeMax.trim() }
}

/** גוף POST /api/service-plugins/<id>/drafts — המבנה שבמדריך המפתח */
export function buildDraftRequest(form: SubmissionForm, pluginFile: Pick<File, 'size'>) {
  const base = {
    kind: form.kind,
    pluginVersion: form.pluginVersion.trim(),
    pluginSize: pluginFile.size,
    serviceRange: rangeFromForm(form),
    sources: form.sources.map((s) => ({ repository: s.repository.trim(), commit: normalizeCommit(s.commit) })),
    changeNotes: form.changeNotes.trim(),
    virusTotalConsent: form.virusTotalConsent
  }
  if (form.kind === 'plugin') return base
  return {
    ...base,
    serviceVersion: form.serviceVersion.trim(),
    uninstall: form.uninstall.trim(),
    assets: form.installers.map((row) => ({
      name: (row.file as File).name,
      size: (row.file as File).size,
      os: row.os,
      arch: row.arch,
      minOs: row.minOs.trim(),
      port: Number(row.port),
      bundledPluginPath: row.bundledPluginPath.trim(),
      releaseUrl: row.releaseUrl.trim()
    }))
  }
}

export interface UploadTask {
  key: string
  url: string
  file: File
  label: string
}

/**
 * סדר ההעלאה: קודם התוסף, ואחריו המתקינים לפי הסדר (native0 = המתקין הראשון בטופס).
 * כתובת חסרה בתשובת השרת — שגיאה (לא מנחשים נתיב).
 */
export function buildUploadQueue(uploads: Record<string, string>, pluginFile: File, form: Pick<SubmissionForm, 'kind' | 'installers'>): UploadTask[] {
  const tasks: UploadTask[] = []
  if (!uploads.plugin) throw new Error('השרת לא החזיר כתובת להעלאת קובץ התוסף')
  tasks.push({ key: 'plugin', url: uploads.plugin, file: pluginFile, label: `תוסף — ${pluginFile.name}` })
  if (form.kind === 'service') {
    form.installers.forEach((row, i) => {
      const key = `native${i}`
      if (!uploads[key]) throw new Error(`השרת לא החזיר כתובת להעלאת מתקין ${i + 1}`)
      tasks.push({ key, url: uploads[key], file: row.file as File, label: `מתקין ${i + 1} — ${(row.file as File).name}` })
    })
  }
  return tasks
}

/** הודעת שגיאה מתשובת API: errors[] (פירוט) או error */
export function apiErrorMessages(body: unknown, fallback: string): string[] {
  if (body && typeof body === 'object') {
    const b = body as { errors?: unknown; error?: unknown; message?: unknown }
    const list = Array.isArray(b.errors) ? b.errors.filter((e): e is string => typeof e === 'string' && e.length > 0) : []
    if (list.length) return list
    // קוד טכני באנגלית (disabled, csrf_rejected) אינו הודעה למשתמש
    const readable = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !/^[a-z0-9_]+$/.test(v)
    if (readable(b.error)) return [b.error]
    if (readable(b.message)) return [b.message]
  }
  return [fallback]
}
