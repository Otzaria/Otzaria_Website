import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import validator from 'otzaria-plugin-validator'

test('regression: the patched scanner finishes exponential-backtracking input', () => {
  // An unpatched dependency must fail this test without freezing the test runner.
  const code = `const v=require('otzaria-plugin-validator');v.scanCodeForApiUsage('const x = values[0] / '+'[a]'.repeat(64)+';');console.log('done')`
  const result = spawnSync(process.execPath, ['-e', code], { timeout: 1500, encoding: 'utf8' })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0)
  assert.match(result.stdout, /done/)
})
test('the dependency patch is idempotent', () => {
  const result = spawnSync(process.execPath, ['scripts/patch-plugin-validator.cjs'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
for (const regex of [String.raw`/[a-z]+/g`, String.raw`/[a/][b/]/`, String.raw`/\[/`, String.raw`/[^\]\\]+/`, String.raw`/[a][b][c]/i`]) {
  test(`scanner still preserves valid regex ${regex}`, () => {
    const source = `const re = ${regex}; Otzaria.call('app.getInfo', {});`
    assert.equal(validator.stripCommentsForScan(source), source)
    assert.ok(validator.scanCodeForApiUsage(source).methods.has('app.getInfo'))
  })
}
for (const prefix of ['// Otzaria.call("fake.method")\n', '/* Otzaria.call("fake.method") */', '<!-- Otzaria.call("fake.method") -->']) {
  test(`scanner still ignores ${prefix.slice(0, 4)} comments`, () => {
    const result = validator.scanCodeForApiUsage(prefix + 'Otzaria.call("app.getInfo")')
    assert.deepEqual([...result.methods], ['app.getInfo'])
  })
}
test('URLs inside strings do not consume real calls', () => {
  assert.ok(validator.scanCodeForApiUsage('const url="https://example.org/a"; Otzaria.call("app.getInfo")').methods.has('app.getInfo'))
})
