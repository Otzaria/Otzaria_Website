import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import {
  ClaudeStreamState, buildClaudeArgs, classifyOutcome, parseDecisionText, permissionDenials, reportLeaksSecret, resetAtFromRateLimit,
  verifyInit,
} from '../src/claudeStream.js'
import { applyPermissionDenials } from '../src/stages/claude.js'

const INIT = { type: 'system', subtype: 'init', session_id: 'sess-1', tools: ['Read', 'Grep', 'Glob'], mcp_servers: [], permissionMode: 'dontAsk' }
const success = (text) => ({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: 'sess-1', num_turns: 7 })

function run(events, opts) {
  const s = new ClaudeStreamState()
  const actions = events.map((e) => s.consume(typeof e === 'string' ? e : JSON.stringify(e)))
  return { state: s, actions, outcome: classifyOutcome(s, opts) }
}

test('תשובה תקינה: החלטה ודוח, ומזהה שיחה נשמר', () => {
  const { outcome } = run([INIT, { type: 'stream_event', event: {} }, success('{"decision":1,"report":"נבדק; אין ממצאים"}')])
  assert.deepEqual(outcome, { kind: 'decision', decision: 1, report: 'נבדק; אין ממצאים', sessionId: 'sess-1' })
})

test('JSON בתוך גדר ```json מתקבל', () => {
  const { outcome } = run([INIT, success('```json\n{"decision":0,"report":"נמצאה האזנה ל-0.0.0.0"}\n```')])
  assert.equal(outcome.kind, 'decision')
  assert.equal(outcome.decision, 0)
})

test('פלט לא תקין → כשל זמני claude_bad_output', () => {
  for (const text of ['ההחלטה: 1', 'הנה: {"decision":1,"report":"x"}', '{"decision":"1","report":"x"}', '{"decision":2,"report":"x"}',
    '{"decision":1,"report":""}', '[1]']) {
    const { outcome } = run([INIT, success(text)])
    assert.equal(outcome.failureClass, 'transient', text)
    assert.equal(outcome.code, 'claude_bad_output', text)
  }
  assert.equal(parseDecisionText('{"decision":1,"report":"' + 'א'.repeat(40_000) + '"}'), null)
})

test('rate_limit_event rejected → quota עם resetAt בשניות או במילישניות', () => {
  const sec = 1_900_000_000
  const a = run([INIT, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: sec } },
    { type: 'result', subtype: 'success', is_error: true, result: 'limit' }]).outcome
  assert.equal(a.failureClass, 'quota')
  assert.equal(a.resetAt.getTime(), sec * 1000)

  const ms = 1_900_000_000_000
  const b = run([INIT, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: ms } }]).outcome
  assert.equal(b.failureClass, 'quota')
  assert.equal(b.resetAt.getTime(), ms)

  const c = run([INIT, { type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } }]).outcome
  assert.equal(c.failureClass, 'quota')
  assert.equal(c.resetAt, null)
  assert.equal(resetAtFromRateLimit({ resetsAt: 'tomorrow' }), null)
})

test('rate_limit_event שאינו rejected אינו מכסה', () => {
  const { outcome } = run([INIT, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', resetsAt: 1 } },
    success('{"decision":1,"report":"תקין"}')])
  assert.equal(outcome.kind, 'decision')
})

test('שגיאות אימות/חיוב → operator; עומס → transient; result שגוי → operator', () => {
  const auth = run([INIT, { type: 'assistant', error: 'authentication_failed', message: {} },
    { type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key' }]).outcome
  assert.deepEqual([auth.failureClass, auth.code], ['operator', 'claude_authentication_failed'])

  const billing = run([INIT, { type: 'assistant', error: 'billing_error', message: {} }]).outcome
  assert.equal(billing.failureClass, 'operator')

  const overloaded = run([INIT, { type: 'assistant', error: 'overloaded', message: {} },
    { type: 'result', subtype: 'error_during_execution', is_error: true }]).outcome
  assert.deepEqual([overloaded.failureClass, overloaded.code], ['transient', 'claude_overloaded'])

  const ctx = run([INIT, { type: 'result', subtype: 'error_during_execution', is_error: true }]).outcome
  assert.deepEqual([ctx.failureClass, ctx.code], ['operator', 'claude_result_error'])
})

test('המילה "מכסה" בטקסט המודל אינה מסווגת כמכסה', () => {
  const { outcome } = run([INIT, { type: 'assistant', message: { content: [{ type: 'text', text: 'rate_limit מכסה מוצתה' }] } },
    success('המכסה מוצתה, rate limit rejected')])
  assert.equal(outcome.code, 'claude_bad_output')
})

test('init עם כלי נוסף או שרת MCP → kill ו-operator', () => {
  const bash = run([{ ...INIT, tools: ['Read', 'Grep', 'Glob', 'Bash'] }, success('{"decision":1,"report":"x"}')])
  assert.equal(bash.actions[0], 'kill')
  assert.deepEqual([bash.outcome.failureClass, bash.outcome.code], ['operator', 'claude_tools_violation'])

  const mcp = run([{ ...INIT, mcp_servers: [{ name: 'evil', status: 'connected' }] }])
  assert.equal(mcp.actions[0], 'kill')
  assert.equal(mcp.outcome.code, 'claude_tools_violation')

  assert.equal(verifyInit({ ...INIT, tools: ['Read'] }).ok, true)
  assert.equal(verifyInit({ subtype: 'init' }).ok, false)

  const noInit = run([{ type: 'assistant', message: {} }])
  assert.equal(noInit.actions[0], 'kill')
  assert.equal(noInit.outcome.code, 'claude_tools_violation')

  for (const permissionMode of [undefined, 'default', 'bypassPermissions', 'acceptEdits']) {
    const mode = run([{ ...INIT, permissionMode }, success('{"decision":1,"report":"x"}')])
    assert.equal(mode.actions[0], 'kill', String(permissionMode))
    assert.deepEqual([mode.outcome.failureClass, mode.outcome.code], ['operator', 'claude_tools_violation'])
  }
})

test('תוצאה תקינה שכבר התקבלה אינה נמחקת בגלל תקיעה או הריגה מאוחרת', () => {
  const ok = success('{"decision":1,"report":"נבדק"}')
  assert.equal(run([INIT, ok], { stalled: true }).outcome.kind, 'decision')
  assert.equal(run([INIT, ok], { aborted: true }).outcome.decision, 1)
  assert.equal(run([INIT, success('לא JSON')], { stalled: true }).outcome.code, 'claude_stalled')
})

test('permission_denials: נתיבים מחוץ לתיקיית הסקירה מתועדים והופכים החלטה 1 ל-0', () => {
  const root = path.resolve('/srv/review')
  const denials = permissionDenials({ permission_denials: [
    { tool_name: 'Read', tool_input: { file_path: '/etc/shadow' } },
    { tool_name: 'Glob', tool_input: { pattern: '/home/**' } },
    { tool_name: 'Grep', tool_input: { pattern: 'x' } },
  ] })
  assert.deepEqual(denials.map((d) => d.tool), ['Read', 'Glob', 'Grep'])
  assert.equal(denials[2].path, null)
  const forced = applyPermissionDenials({ decision: 1, report: 'הכל תקין' }, denials, root)
  assert.equal(forced.decision, 0)
  assert.match(forced.report, /^הכל תקין\n\nהערת הבודק האוטומטי: 3 /)
  assert.match(forced.report, /\/etc\/shadow/)
  const inside = applyPermissionDenials({ decision: 1, report: 'r' }, [{ tool: 'Read', path: 'files/1.txt' }], root)
  assert.equal(inside.decision, 1)
  assert.match(inside.report, /נחסמו/)
  assert.deepEqual(applyPermissionDenials({ decision: 1, report: 'r' }, [], root), { decision: 1, report: 'r' })
  const long = applyPermissionDenials({ decision: 0, report: 'א'.repeat(40_000) }, denials, root)
  assert.ok(Buffer.byteLength(long.report) <= 64 * 1024)
})

test('שומר תקיעה, שגיאת הפעלה ויציאה בלי result', () => {
  assert.equal(run([INIT], { stalled: true }).outcome.code, 'claude_stalled')
  assert.equal(run([INIT], { stalled: true }).outcome.failureClass, 'transient')
  assert.equal(run([], { spawnError: new Error('ENOENT') }).outcome.failureClass, 'operator')
  assert.equal(run([INIT, 'garbage line'], { exitCode: 1 }).outcome.code, 'claude_exit')
})

test('ארגומנטים: מגבלות כלים, ללא max-turns/budget, ומצב התחברות', () => {
  const base = { prompt: 'P', policyFile: '/p.md', mcpConfigFile: '/m.json' }
  const api = buildClaudeArgs({ ...base, authMode: 'api_key' })
  assert.deepEqual(api.slice(0, 2), ['-p', 'P'])
  assert.ok(api.includes('--bare'))
  assert.ok(!api.includes('--setting-sources'))
  for (const flag of ['--max-turns', '--max-budget-usd', '--dangerously-skip-permissions']) assert.ok(!api.includes(flag))
  const i = api.indexOf('--disallowedTools')
  assert.deepEqual(api.slice(i + 1, i + 9), ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Agent', 'mcp__*'])
  assert.equal(api[api.indexOf('--tools') + 1], 'Read,Grep,Glob')
  assert.equal(api[api.indexOf('--permission-mode') + 1], 'dontAsk')
  assert.ok(api.includes('--strict-mcp-config') && api.includes('--no-session-persistence') && api.includes('--disable-slash-commands'))

  const sub = buildClaudeArgs({ ...base, authMode: 'subscription' })
  assert.ok(!sub.includes('--bare'))
  assert.equal(sub[sub.indexOf('--setting-sources') + 1], 'user')
  assert.deepEqual(JSON.parse(sub[sub.indexOf('--settings') + 1]), { disableAllHooks: true })
  assert.ok(!api.includes('--allowedTools'))
  assert.throws(() => buildClaudeArgs({ ...base, authMode: undefined }))
})

test('דוח שמכיל סוד של השרת נחסם', () => {
  assert.equal(reportLeaksSecret('הכל תקין', ['super-secret-value-123']), false)
  assert.equal(reportLeaksSecret('נמצא: super-secret-value-123', ['super-secret-value-123']), true)
  assert.equal(reportLeaksSecret('token sk-ant-oat01-abcdefghijk', []), true)
})


test('התקדמות נמדדת רק באירועי פרוטוקול מוכרים אחרי init', () => {
  const state = new ClaudeStreamState()
  const consume = (event) => state.consume(typeof event === 'string' ? event : JSON.stringify(event))
  for (const ev of ['log', { tick: 1 }, { type: 'stream_event', event: { type: 'content_block_delta' } }]) consume(ev)
  assert.equal(state.progressEvents, 0)
  consume(INIT)
  assert.equal(state.progressEvents, 1)
  for (const ev of [INIT, { type: 'system', subtype: 'status' }, { type: 'rate_limit_event' }, { type: 'stream_event', event: { type: 'ping' } }, { type: 'assistant' }]) consume(ev)
  assert.equal(state.progressEvents, 1)
  consume({ type: 'stream_event', event: { type: 'content_block_delta', delta: { text: 'התקדמות' } } })
  consume({ type: 'assistant', message: { content: [] } })
  consume(success('{"decision":1,"report":"תקין"}'))
  assert.equal(state.progressEvents, 4)
})
