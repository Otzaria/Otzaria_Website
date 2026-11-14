import path from 'node:path'
import { validateDecision } from './policy.js'

export const ALLOWED_TOOLS = Object.freeze(['Read', 'Grep', 'Glob'])
export const OPERATOR_ERRORS = new Set(['authentication_failed', 'oauth_org_not_allowed', 'account_on_hold', 'billing_error',
  'cloud_credential_error'])
export const TRANSIENT_ERRORS = new Set(['rate_limit', 'overloaded', 'server_error'])
// במצב subscription נטענות הגדרות המשתמש; hooks משם היו רצים בתוך הסקירה.
export const SUBSCRIPTION_FLAG_SETTINGS = JSON.stringify({ disableAllHooks: true })

/**
 * ארגומנטים ל-CLI. הפרומפט מגיע ראשון אחרי -p; כל ערך הוא איבר נפרד במערך (ללא shell).
 * @param {{prompt:string, policyFile:string, mcpConfigFile:string, authMode:'api_key'|'subscription'}} o
 */
export function buildClaudeArgs({ prompt, policyFile, mcpConfigFile, authMode }) {
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    // ללא --allowedTools: אישור מראש של Read חל על כל נתיב, ואילו dontAsk דוחה קריאה מחוץ לתיקיית העבודה
    '--tools', ALLOWED_TOOLS.join(','),
    '--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent', 'mcp__*',
    '--permission-mode', 'dontAsk',
    '--system-prompt-file', policyFile,
    '--strict-mcp-config',
    '--mcp-config', mcpConfigFile,
    '--no-session-persistence',
    '--disable-slash-commands',
  ]
  if (authMode === 'api_key') args.push('--bare')
  else if (authMode === 'subscription') args.push('--setting-sources', 'user', '--settings', SUBSCRIPTION_FLAG_SETTINGS)
  else throw new Error('CLAUDE_AUTH_MODE is required')
  return args
}

/** אירוע system/init: כלים ⊆ {Read,Grep,Glob}, ללא שרתי MCP, ומצב הרשאות dontAsk. */
export function verifyInit(ev) {
  if (!Array.isArray(ev?.tools)) return { ok: false, reason: 'init ללא רשימת כלים' }
  if (ev.permissionMode !== 'dontAsk') {
    return { ok: false, reason: `מצב ההרשאות של הבודק אינו dontAsk (${typeof ev.permissionMode === 'string' ? ev.permissionMode.slice(0, 40) : 'לא צוין'})` }
  }
  const extra = ev.tools.filter((t) => !ALLOWED_TOOLS.includes(t))
  if (extra.length) return { ok: false, reason: `כלים לא מורשים זמינים לבודק: ${extra.join(', ')}` }
  const mcp = ev.mcp_servers ?? ev.mcpServers ?? []
  if (!Array.isArray(mcp) || mcp.length) return { ok: false, reason: 'שרתי MCP פעילים בבודק' }
  return { ok: true }
}

/** resetsAt: מספר; קטן מ-1e12 = שניות, אחרת מילישניות. */
export function resetAtFromRateLimit(info) {
  const v = info?.resetsAt
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null
  return new Date(v < 1e12 ? v * 1000 : v)
}

/**
 * מצב הזרם המובנה. מסווג רק לפי שדות פרוטוקול, לעולם לא לפי טקסט שהמודל כתב.
 */
export class ClaudeStreamState {
  constructor() {
    this.sawInit = false
    this.initViolation = null
    this.rejectedResetAt = undefined
    this.assistantErrors = []
    this.result = null
    this.sessionId = null
    this.events = 0
    this.progressEvents = 0
    this.badLines = 0
  }

  /** @returns {'continue'|'kill'} */
  consume(line) {
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      this.badLines++
      return 'continue'
    }
    if (!ev || typeof ev !== 'object') return 'continue'
    this.events++
    if (typeof ev.session_id === 'string' && !this.sessionId) this.sessionId = ev.session_id

    if (ev.type === 'system' && ev.subtype === 'init') {
      if (this.sawInit) return 'continue'
      this.sawInit = true
      const v = verifyInit(ev)
      if (!v.ok) {
        this.initViolation = v.reason
        return 'kill'
      }
      this.progressEvents++
      return 'continue'
    }
    if (!this.sawInit && (ev.type === 'assistant' || ev.type === 'user' || ev.type === 'result')) {
      this.initViolation = 'לא התקבל אירוע init לפני תחילת הסקירה'
      return 'kill'
    }
    if (this.sawInit && (
      (['assistant', 'user'].includes(ev.type) && (ev.message || ev.error)) ||
      (ev.type === 'result' && typeof ev.subtype === 'string') ||
      (ev.type === 'stream_event' && ['message_start', 'content_block_start', 'content_block_delta',
        'content_block_stop', 'message_delta', 'message_stop'].includes(ev.event?.type))
    )) this.progressEvents++
    if (ev.type === 'rate_limit_event') {
      if (ev.rate_limit_info?.status === 'rejected') this.rejectedResetAt = resetAtFromRateLimit(ev.rate_limit_info)
      return 'continue'
    }
    if (ev.type === 'assistant') {
      const err = typeof ev.error === 'string' ? ev.error : typeof ev.error?.type === 'string' ? ev.error.type : null
      if (err) this.assistantErrors.push(err)
      return 'continue'
    }
    if (ev.type === 'result') this.result = ev
    return 'continue'
  }
}

/** הטקסט הסופי חייב להיות אובייקט JSON יחיד, אפשר בתוך גדר ```json. */
export function parseDecisionText(text) {
  if (typeof text !== 'string') return null
  let body = text.trim()
  const fence = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(body)
  if (fence) body = fence[1].trim()
  if (!body.startsWith('{') || !body.endsWith('}')) return null
  let obj
  try {
    obj = JSON.parse(body)
  } catch {
    return null
  }
  const v = validateDecision(obj)
  return v.ok ? { decision: v.decision, report: v.report } : null
}

/** `permission_denials` מאירוע result: כלי ונתיב (null כשאין נתיב מוחלט/יחסי מזוהה). */
export function permissionDenials(result) {
  const list = Array.isArray(result?.permission_denials) ? result.permission_denials : []
  return list.map((d) => {
    const input = d?.tool_input && typeof d.tool_input === 'object' ? d.tool_input : {}
    const candidates = [input.file_path, input.path, input.notebook_path, path.isAbsolute(String(input.pattern ?? '')) ? input.pattern : null]
    return { tool: typeof d?.tool_name === 'string' ? d.tool_name : '?', path: candidates.find((v) => typeof v === 'string' && v) ?? null }
  })
}

const SECRET_PATTERNS = [/sk-ant-[A-Za-z0-9_-]{8,}/, /ghp_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /gho_[A-Za-z0-9]{20,}/]

/** הדוח נשלח למפתח: אסור שיכיל סוד של השרת (למשל אחרי הזרקת הוראות שגרמה לקריאת קובץ סודות). */
export function reportLeaksSecret(report, secrets = []) {
  if (secrets.some((s) => s && report.includes(s))) return true
  return SECRET_PATTERNS.some((re) => re.test(report))
}

/**
 * מסווג את תוצאת הריצה.
 * @returns {{kind:'decision', decision:0|1, report:string, sessionId:string|null}
 *   | {kind:'failure', failureClass:'transient'|'quota'|'operator', code:string, message:string, resetAt?:Date|null}}
 */
export function classifyOutcome(state, { stalled = false, spawnError = null, exitCode = null, aborted = false } = {}) {
  const fail = (failureClass, code, message, extra = {}) => ({ kind: 'failure', failureClass, code, message, ...extra })
  if (spawnError) return fail('operator', 'claude_unavailable', 'לא ניתן להפעיל את Claude Code בשרת הבדיקה')
  if (state.initViolation) return fail('operator', 'claude_tools_violation', `תצורת הבודק אינה מוגבלת כנדרש: ${state.initViolation}`)

  const r = state.result
  const success = r && r.subtype === 'success' && r.is_error !== true
  // החלטה שכבר התקבלה אינה נמחקת בגלל תקיעה או הריגה מאוחרת של התהליך.
  const parsed = success ? parseDecisionText(r.result) : null
  if (parsed) return { kind: 'decision', ...parsed, sessionId: state.sessionId }
  if (stalled) return fail('transient', 'claude_stalled', 'הסקירה לא הפיקה אירועים במשך 10 דקות ונעצרה')
  if (aborted) return fail('transient', 'claude_aborted', 'הסקירה נעצרה')
  if (success && state.rejectedResetAt === undefined) return fail('transient', 'claude_bad_output', 'תשובת הבודק אינה במבנה ההחלטה הנדרש')
  if (state.rejectedResetAt !== undefined) {
    return fail('quota', 'claude_quota', 'מכסת Claude מוצתה', { resetAt: state.rejectedResetAt })
  }
  const op = state.assistantErrors.find((e) => OPERATOR_ERRORS.has(e))
  if (op) return fail('operator', `claude_${op}`, `שגיאת חשבון Claude (${op}) — נדרש טיפול של אחראי השרת`)
  const tr = state.assistantErrors.find((e) => TRANSIENT_ERRORS.has(e))
  if (tr) return fail('transient', `claude_${tr}`, `שגיאה זמנית של Claude (${tr})`)
  if (r) {
    return fail('operator', 'claude_result_error',
      `הסקירה הסתיימה בשגיאה (${typeof r.subtype === 'string' ? r.subtype : 'unknown'}), למשל חריגת הקשר — נדרש טיפול תפעולי`)
  }
  if (!state.sawInit && state.events === 0) {
    return fail('transient', 'claude_no_output', `Claude Code יצא בלי פלט מובנה (קוד ${exitCode ?? '?'})`)
  }
  return fail('transient', 'claude_exit', `Claude Code יצא לפני סיום הסקירה (קוד ${exitCode ?? '?'})`)
}
