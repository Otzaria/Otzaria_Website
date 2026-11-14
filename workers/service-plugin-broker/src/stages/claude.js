import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { LIMITS, STALL_TIMEOUT_MS } from '../policy.js'
import { JobFailure, abortReason, operator } from '../errors.js'
import { killTree } from '../process.js'
import { ClaudeStreamState, buildClaudeArgs, classifyOutcome, permissionDenials, reportLeaksSecret } from '../claudeStream.js'
import { REVIEW_PROMPT, buildAttestationText, buildContextText } from '../reviewDocs.js'
import { secretValues } from '../config.js'
import { OBJECT_ID_RE, escapeForList } from '../util.js'
import { ensureHotspots, ensureSource } from './source.js'

const REVIEW_DIR_ENTRIES = ['ATTESTATION.txt', 'CONTEXT.txt', 'DIFF.txt', 'HOTSPOTS.txt', 'INDEX.txt', 'files']
const PRIVATE_JOB_ENTRIES = ['claude-result.json', 'mcp-empty.json', 'review', 'stages.log']
const DATA_DIR_ENTRIES = ['jobs', 'private', 'snapshots']
const MAX_LISTED_DENIALS = 20

/**
 * מיד לפני הפעלת Claude: תיקיית הסקירה וכל תיקיות האב עד תיקיית הנתונים מכילות רק שמות צפויים,
 * כך ש-CLAUDE.md, .claude או .mcp.json שנשתלו אינם נטענים לבודק.
 */
export async function verifyReviewTree(ctx) {
  const { reviewDir, privateDir } = ctx.paths
  const checks = [
    [reviewDir, (e) => REVIEW_DIR_ENTRIES.includes(e.name) && (e.name === 'files' ? e.isDirectory() : e.isFile())],
    [path.join(reviewDir, 'files'), (e) => /^[1-9]\d*\.txt$/.test(e.name) && e.isFile()],
    [privateDir, (e) => PRIVATE_JOB_ENTRIES.includes(e.name) && (e.name === 'review' ? e.isDirectory() : e.isFile())],
    [path.dirname(privateDir), (e) => OBJECT_ID_RE.test(e.name) && e.isDirectory()],
    [ctx.config.dataDir, (e) => DATA_DIR_ENTRIES.includes(e.name) && e.isDirectory()],
  ]
  const unexpected = []
  for (const [dir, ok] of checks) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (!ok(e)) unexpected.push(path.join(dir, e.name))
    }
  }
  const present = (await readdir(reviewDir)).sort()
  if (unexpected.length || present.join('|') !== REVIEW_DIR_ENTRIES.join('|')) {
    throw operator('review_dir_unexpected', `תיקיית הסקירה או תיקיות האב שלה מכילות קבצים לא צפויים: ${unexpected.slice(0, 10).join(', ') || present.join(', ')}`)
  }
}

const isInside = (root, p) => {
  const rel = path.relative(root, p)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function fitReport(report, note) {
  const room = LIMITS.reportBytes - Buffer.byteLength(note, 'utf8') - 16
  const body = Buffer.byteLength(report, 'utf8') <= room ? report : `${Buffer.from(report, 'utf8').subarray(0, room).toString('utf8')}…`
  return body + note
}

/** ניסיונות גישה שנחסמו מתועדים בדוח; החלטה 1 עם ניסיון גישה מחוץ לתיקיית הסקירה הופכת ל-0. */
export function applyPermissionDenials({ decision, report }, denials, reviewDir) {
  if (!denials.length) return { decision, report }
  const outside = denials.filter((d) => !d.path || !isInside(reviewDir, path.resolve(reviewDir, d.path)))
  const listed = denials.slice(0, MAX_LISTED_DENIALS)
    .map((d) => `- ${escapeForList(d.tool)}: ${d.path ? escapeForList(d.path).slice(0, 300) : '(נתיב לא ידוע)'}`)
  let note = `\n\nהערת הבודק האוטומטי: ${denials.length} ניסיונות גישה של הסוקר נחסמו בהרשאות:\n${listed.join('\n')}`
  if (denials.length > MAX_LISTED_DENIALS) note += `\n- ועוד ${denials.length - MAX_LISTED_DENIALS}`
  let finalDecision = decision
  if (decision === 1 && outside.length) {
    finalDecision = 0
    note += '\nהסוקר ניסה לגשת לנתיבים מחוץ לחומר הסקירה, ולכן ההחלטה שונתה לדחייה: ייתכן שתוכן בהגשה ניסה להשפיע על הסוקר.'
  }
  return { decision: finalDecision, report: fitReport(report, note) }
}

/** סביבת Claude: אישורי Claude בלבד, לפי מצב ההתחברות. סוד המתווך ו-GH_TOKEN לעולם לא. */
export function claudeEnv(config) {
  const env = {
    HOME: config.home,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CONFIG_DIR: config.claudeConfigDir || undefined,
  }
  if (config.claudeAuthMode === 'api_key') env.ANTHROPIC_API_KEY = config.anthropicApiKey
  return env
}

export async function prepareReviewDir(ctx) {
  const source = await ensureSource(ctx)
  const dir = ctx.paths.reviewDir
  await ensureHotspots(ctx)
  await writeFile(path.join(dir, 'CONTEXT.txt'), buildContextText(ctx.job, ctx.receipts, { source }))
  await writeFile(path.join(dir, 'ATTESTATION.txt'), buildAttestationText(ctx.job, ctx.receipts, source.rows))
  await writeFile(ctx.paths.mcpConfig, JSON.stringify({ mcpServers: {} }))
  return dir
}

/** הרצת Claude Code אחת עם שומר תקיעה; מחזירה {decision, report, sessionId} או זורקת JobFailure. */
export async function runClaudeReview(ctx) {
  const cwd = await prepareReviewDir(ctx)
  const state = new ClaudeStreamState()
  let child = null
  const args = buildClaudeArgs({
    prompt: REVIEW_PROMPT,
    policyFile: ctx.config.policyFile,
    mcpConfigFile: ctx.paths.mcpConfig,
    authMode: ctx.config.claudeAuthMode,
  })
  await verifyReviewTree(ctx)
  await ctx.stageLog('claude', 'spawn', { authMode: ctx.config.claudeAuthMode })
  const run = await ctx.exec(ctx.config.claude, args, {
    cwd,
    env: claudeEnv(ctx.config),
    captureStdout: false,
    stallOnStdoutLine: true,
    stallTimeoutMs: ctx.config.stallTimeoutMs ?? STALL_TIMEOUT_MS,
    killGraceMs: ctx.config.killGraceMs ?? 10_000,
    onSpawn: (c) => {
      child = c
    },
    onStdoutLine: (line) => {
      const hadSession = state.sessionId
      const progressBefore = state.progressEvents
      if (state.consume(line) === 'kill') killTree(child, ctx.config.killGraceMs ?? 10_000)
      if (!hadSession && state.sessionId) ctx.stageLog('claude', 'session', { session_id: state.sessionId })
      return state.progressEvents > progressBefore
    },
  })
  const outcome = classifyOutcome(state, { stalled: run.stalled, spawnError: run.spawnError, exitCode: run.code, aborted: run.aborted })
  await ctx.stageLog('claude', 'exit', {
    session_id: state.sessionId, code: run.code, signal: run.signal, stalled: run.stalled, events: state.events,
    outcome: outcome.kind === 'decision' ? `decision:${outcome.decision}` : `${outcome.failureClass}:${outcome.code}`,
  })
  if (run.aborted && ctx.signal?.aborted && outcome.kind !== 'decision') throw abortReason(ctx.signal)
  if (outcome.kind === 'failure') {
    throw new JobFailure(outcome.failureClass, outcome.code, outcome.message, { resetAt: outcome.resetAt ?? null })
  }
  const denials = permissionDenials(state.result)
  if (denials.length) await ctx.stageLog('claude', 'permission_denials', { denials })
  const { decision, report } = applyPermissionDenials(outcome, denials, cwd)
  if (reportLeaksSecret(report, secretValues(ctx.config))) {
    throw operator('claude_report_secret', 'דוח הבודק מכיל מחרוזת שנראית כסוד של השרת — לא נשלח. נדרשת בדיקת אחראי השרת.')
  }
  const r = state.result ?? {}
  return {
    decision,
    report,
    session_id: state.sessionId,
    numTurns: Number.isFinite(r.num_turns) ? r.num_turns : null,
    durationMs: Number.isFinite(r.duration_ms) ? r.duration_ms : null,
  }
}
