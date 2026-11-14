import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import {
  ASSET_KEYS, LIMITS, REQUIRED_RECEIPTS, isValidBundledPath, isValidCommit, isValidRepository, validateDecision,
} from './policy.js'
import { JobFailure, Rejection, operator } from './errors.js'
import { ensureDir, sha256, throwIfAborted } from './util.js'
import { clamavStage, hashesStage, releaseStage } from './stages/scan.js'
import { extractStage } from './stages/extract.js'
import { attestationStage } from './stages/attestation.js'
import { virustotalStage } from './stages/virustotal.js'
import { prescanStage, sourceStage } from './stages/source.js'
import { runClaudeReview } from './stages/claude.js'

export const DEFAULT_STAGES = Object.freeze({
  hashes: hashesStage,
  clamav: clamavStage,
  release: releaseStage,
  extract: extractStage,
  attestation: attestationStage,
  virustotal: virustotalStage,
  source: sourceStage,
  prescan: prescanStage,
  claude: runClaudeReview,
})

const STAGE_LABELS = {
  hashes: 'אימות גדלים ו-SHA-256', clamav: 'סריקת ClamAV', release: 'השוואה לקובץ GitHub Release',
  extract: 'חילוץ התוסף מתוך המתקין', attestation: 'אימות אישור הבנייה', virustotal: 'VirusTotal',
  source: 'הכנת המקור', prescan: 'סינון קבוע',
}

export function rejectionReport(job, rejection) {
  return [
    `ההגשה נדחתה בשלב: ${STAGE_LABELS[rejection.stage] ?? rejection.stage}.`,
    '',
    rejection.report,
    '',
    `היקף: בדיקה אוטומטית קבועה (ללא AI) של ${job.kind === 'service' ? 'התוסף והמתקינים' : 'התוסף'}. הבדיקה נעצרה בשלב זה, ולכן שלבים מאוחרים יותר — כולל סקירת המקור — לא בוצעו.`,
    'מגבלות: דחייה זו אינה האשמה בכוונה זדונית. לאחר תיקון יש להגיש גרסה חדשה.',
  ].join('\n')
}

/** קבלת claude נשמרת בשרת עד 64KiB; דוח ארוך יותר נשלח במלואו רק ב-result, והקבלה מחזיקה את ה-hash שלו. */
export function claudeReceiptData(data) {
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') <= LIMITS.reportBytes) return data
  const { report, ...rest } = data
  return { ...rest, reportOmitted: true, reportSha256: sha256(report), reportBytes: Buffer.byteLength(report, 'utf8') }
}

/** שדות המשימה מהשרת נבדקים באותם מאמתים של האתר לפני שמשהו מהם מגיע לכלי או לנתיב. */
export function jobProblems(job) {
  const problems = []
  const sources = job?.submission?.sources
  if (!Array.isArray(sources) || !sources.length || sources.length > LIMITS.maxSources) problems.push('sources')
  else if (!sources.every((s) => isValidRepository(s?.repository) && isValidCommit(s?.commit))) problems.push('source')
  const assets = job?.assets ?? []
  if (!Array.isArray(assets)) return [...problems, 'assets']
  if (job.kind === 'service' && !assets.length) problems.push('service_without_assets')
  if (job.kind === 'plugin' && assets.length) problems.push('plugin_with_assets')
  const keys = assets.map((a) => a?.key)
  if (keys.some((k) => k === 'plugin' || !ASSET_KEYS.includes(k)) || new Set(keys).size !== keys.length) problems.push('asset_key')
  if (!assets.every((a) => isValidBundledPath(a?.bundledPluginPath))) problems.push('bundled_path')
  return problems
}

const localResultMac = (ctx, digest, data) => createHmac('sha256', String(ctx.config.workerSecret ?? ''))
  .update(`otzaria-broker/claude-result\0${ctx.job.reviewId}\0${digest}\0${JSON.stringify(data)}`).digest()

/** תוצאת Claude מקומית חתומה ב-HMAC מסוד המתווך: קובץ מזויף אינו נשלח ואינו גורם להרצה חוזרת שקטה. */
export async function writeLocalClaude(ctx, data) {
  await ensureDir(ctx.paths.privateDir)
  const mac = localResultMac(ctx, ctx.job.manifestDigest, data).toString('hex')
  await writeFile(ctx.paths.claudeResult, JSON.stringify({ manifestDigest: ctx.job.manifestDigest, data, mac }), { mode: 0o600 })
}

async function readLocalClaude(ctx) {
  let raw
  try {
    raw = await readFile(ctx.paths.claudeResult, 'utf8')
  } catch (err) {
    if (err?.code === 'ENOENT') return null
    throw operator('claude_local_result_unreadable', 'תוצאת Claude השמורה בבודק אינה קריאה — נדרשת בדיקת אחראי השרת')
  }
  let saved = null
  try {
    saved = JSON.parse(raw)
  } catch {
    /* נבדק למטה */
  }
  const mac = typeof saved?.mac === 'string' && /^[0-9a-f]{64}$/.test(saved.mac) ? Buffer.from(saved.mac, 'hex') : null
  if (!mac || !timingSafeEqual(mac, localResultMac(ctx, saved.manifestDigest, saved.data))) {
    throw operator('claude_local_result_forged',
      'תוצאת Claude השמורה בבודק אינה מאומתת (HMAC) וייתכן שזויפה. Claude לא יורץ שוב אוטומטית — נדרשת בדיקת אחראי השרת.')
  }
  if (saved.manifestDigest !== ctx.job.manifestDigest) return null
  return validateDecision(saved.data).ok ? saved.data : null
}

const REJECTION_REASON_CHARS = 8000

/**
 * מריץ את שלבי הבדיקה לפי הסדר. שלב עם קבלה תקפה (אותו digest) מדולג; קבלת `claude` קיימת — Claude לא רץ שוב.
 * @returns {Promise<{decision:0|1, report:string}>}
 */
export async function runPipeline(ctx, { stages = DEFAULT_STAGES } = {}) {
  const { job, api } = ctx
  const order = REQUIRED_RECEIPTS[job.kind]
  if (!order) throw operator('job_invalid_kind', 'סוג משימה לא מוכר')
  const problems = jobProblems(job)
  if (problems.length) throw operator('job_invalid', `פרטי המשימה מהאתר אינם תקינים (${problems.join(', ')})`)
  await ensureDir(ctx.paths.tmpDir)

  const checkpoint = async (stage, data) => {
    await api.checkpoint(job.reviewId, job.leaseToken, { stage, digest: job.manifestDigest, data }, ctx.signal)
    ctx.receipts.set(stage, { stage, digest: job.manifestDigest, at: new Date().toISOString(), data })
  }

  const stored = ctx.receipts.get('claude')
  if (stored) {
    let data = stored.data
    if (data?.reportOmitted) {
      const local = await readLocalClaude(ctx)
      if (!local || sha256(local.report) !== data.reportSha256) {
        throw operator('claude_report_unavailable', 'הדוח המלא של Claude אינו שמור בבודק זה — נדרשת החלטת אחראי השרת')
      }
      data = local
    }
    const v = validateDecision(data)
    if (!v.ok) throw operator('claude_receipt_invalid', 'קבלת Claude השמורה אינה תקינה')
    await ctx.stageLog('claude', 'reuse_receipt')
    return { decision: v.decision, report: v.report }
  }

  for (const stage of order) {
    throwIfAborted(ctx.signal)
    if (ctx.receipts.get(stage)?.data?.rejected === true) {
      // דחייה שנשמרה לפני ניתוק: לעולם לא ממשיכים לשלבים הבאים.
      await ctx.stageLog(stage, 'reuse_rejection')
      return { decision: 0, report: rejectionReport(job, new Rejection(stage, String(ctx.receipts.get(stage).data.reason ?? ''))) }
    }
    if (ctx.receipts.has(stage)) {
      await ctx.stageLog(stage, 'skip')
      continue
    }
    if (stage === 'claude') {
      // תוצאה מקומית מריצה קודמת שה-checkpoint שלה לא הגיע לשרת — לא מריצים Claude שוב.
      const local = await readLocalClaude(ctx)
      const data = local ?? (await stages.claude(ctx))
      if (!local) await writeLocalClaude(ctx, data)
      await checkpoint('claude', claudeReceiptData(data))
      await ctx.stageLog('claude', 'done', { session_id: data.session_id ?? null, decision: data.decision })
      return { decision: data.decision, report: data.report }
    }
    await ctx.stageLog(stage, 'start')
    let data
    try {
      data = await stages[stage](ctx)
    } catch (err) {
      if (err instanceof Rejection) {
        await ctx.stageLog(stage, 'rejected', { data: err.data })
        await checkpoint(stage, { rejected: true, reason: String(err.report).slice(0, REJECTION_REASON_CHARS) })
        return { decision: 0, report: rejectionReport(job, err) }
      }
      if (err instanceof JobFailure) await ctx.stageLog(stage, 'failed', { class: err.failureClass, code: err.code })
      throw err
    }
    await checkpoint(stage, data)
    await ctx.stageLog(stage, 'done')
  }
  throw operator('pipeline_incomplete', 'הצינור הסתיים בלי החלטה')
}

/** מחיקת הקבצים המקומיים של המשימה אחרי החלטה סופית (תמונת המקור נשמרת לניקוי התחזוקה). */
export async function cleanupJobFiles(ctx) {
  await rm(ctx.paths.assetsDir, { recursive: true, force: true })
  await rm(ctx.paths.extractDir, { recursive: true, force: true })
  await rm(ctx.paths.tmpDir, { recursive: true, force: true })
  await rm(ctx.paths.reviewDir, { recursive: true, force: true })
}
