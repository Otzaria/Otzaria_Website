import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildChildEnv, expandWrapper, runProcess } from '../src/process.js'
import { fakeBin } from './helpers.mjs'

const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('שומר תקיעה: תהליך שמשתתק נהרג ומסומן stalled', async () => {
  const lines = []
  const started = Date.now()
  const r = await runProcess(fakeBin('silent-child.mjs'), [], {
    stallTimeoutMs: 300, killGraceMs: 200, captureStdout: false, onStdoutLine: (l) => lines.push(l),
  })
  assert.equal(r.stalled, true)
  assert.equal(lines.length, 1)
  assert.ok(Date.now() - started < 5000)
})

test('שומר תקיעה: פעילות רציפה (stdout/stderr) אינה נעצרת גם מעבר לסף', async () => {
  const r = await runProcess(fakeBin('chatty-child.mjs', '900'), [], { stallTimeoutMs: 300, killGraceMs: 200 })
  assert.equal(r.stalled, false)
  assert.equal(r.code, 0)
  assert.ok(r.stderr.length > 0)
})

test('ביטול דרך signal הורג את התהליך', async () => {
  const ctrl = new AbortController()
  setTimeout(() => ctrl.abort('stop'), 200)
  const r = await runProcess(fakeBin('silent-child.mjs'), [], { signal: ctrl.signal, killGraceMs: 200 })
  assert.equal(r.aborted, true)
})

test('קובץ הפעלה חסר → spawnError ולא קריסה', async () => {
  const r = await runProcess({ bin: 'definitely-not-a-real-binary-xyz', args: [] }, [])
  assert.ok(r.spawnError)
})

test('סביבת הבן מינימלית: סוד המתווך אינו עובר', () => {
  const env = buildChildEnv({ GH_TOKEN: 'gh', EMPTY: '' },
    { PATH: '/bin', SERVICE_PLUGIN_WORKER_SECRET: 's', ANTHROPIC_API_KEY: 'k', VT_API_KEY: 'v', HOME: '/h' })
  assert.equal(env.SERVICE_PLUGIN_WORKER_SECRET, undefined)
  assert.equal(env.ANTHROPIC_API_KEY, undefined)
  assert.equal(env.VT_API_KEY, undefined)
  assert.equal(env.HOME, undefined)
  assert.equal(env.GH_TOKEN, 'gh')
  assert.equal(env.EMPTY, undefined)
})

test('עטיפת בידוד מוצבת לפני הפקודה, בלי shell', async () => {
  const wrapper = [process.execPath, fakeBin('echo-args.mjs').args[0], '--sandbox-flag']
  const r = await runProcess({ bin: '7z', args: ['--pre'] }, ['x', '--', 'file; rm -rf /'], { wrapper })
  assert.equal(r.code, 0)
  assert.deepEqual(JSON.parse(r.stdout), ['--sandbox-flag', '7z', '--pre', 'x', '--', 'file; rm -rf /'])
})

test('עטיפת בידוד כתבנית: {in}/{out} מוחלפים לכל הפעלה; מציין בלי ערך → שגיאה', () => {
  const wrapper = ['bwrap', '--ro-bind', '{in}', '{in}', '--bind', '{out}', '{out}', '--']
  assert.deepEqual(expandWrapper(wrapper, { in: '/j/a.zip', out: '/j/x/L0' }),
    ['bwrap', '--ro-bind', '/j/a.zip', '/j/a.zip', '--bind', '/j/x/L0', '/j/x/L0', '--'])
  assert.throws(() => expandWrapper(wrapper, { in: '/j/a.zip' }))
  assert.equal(expandWrapper(null, {}), null)
})

test('צאצא שיצא מהקבוצה ומחזיק את stdout אינו משאיר את runProcess תלוי', async () => {
  let pid = null
  const started = Date.now()
  const r = await runProcess(fakeBin('escaping-child.mjs'), [], {
    onStdoutLine: (l) => {
      pid ??= Number(l)
    },
  })
  try {
    assert.equal(r.code, 0)
    assert.ok(pid > 0)
    assert.ok(Date.now() - started < 10_000, `resolved after ${Date.now() - started}ms`)
  } finally {
    if (pid && alive(pid)) process.kill(pid, 'SIGKILL')
  }
})

test('SIGKILL לקבוצה נשלח גם אחרי שהמנהיג יצא (נכד שמתעלם מ-SIGTERM)', { skip: process.platform === 'win32' && 'קבוצות תהליכים — POSIX בלבד' }, async () => {
  const ctrl = new AbortController()
  let pid = null
  await runProcess(fakeBin('term-ignoring-group.mjs'), [], {
    signal: ctrl.signal, killGraceMs: 300,
    onStdoutLine: (l) => {
      pid = Number(l)
      ctrl.abort('stop')
    },
  })
  assert.ok(pid > 0)
  await new Promise((r) => setTimeout(r, 800))
  const survived = alive(pid)
  if (survived) process.kill(pid, 'SIGKILL')
  assert.equal(survived, false)
})


test('שומר אירועים: פלט לוגים רציף ב-stdout וב-stderr אינו מאפס תקיעה', async () => {
  const r = await runProcess(fakeBin('chatty-child.mjs', '1600'), [], {
    stallTimeoutMs: 400, killGraceMs: 100, stallOnStdoutLine: true,
    onStdoutLine: () => false,
  })
  assert.equal(r.stalled, true)
  assert.ok(r.stderr.length > 0)
})

test('שומר אירועים: אירועים שמזוהים בידי המפענח משאירים תהליך פעיל', async () => {
  const r = await runProcess(fakeBin('chatty-child.mjs', '1200'), [], {
    stallTimeoutMs: 400, killGraceMs: 100, stallOnStdoutLine: true,
    onStdoutLine: (line) => typeof JSON.parse(line).tick === 'number',
  })
  assert.equal(r.stalled, false)
  assert.equal(r.code, 0)
})
