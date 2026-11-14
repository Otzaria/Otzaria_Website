import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { Rejection } from '../src/errors.js'
import { JobContext, localAssetName } from '../src/job.js'
import { SourceCollector, SourceFormatError, SourceLimitError, buildDiffText, decodeUtf16, looksLikeText } from '../src/source.js'
import { clamavStage, parseClamOutput } from '../src/stages/scan.js'
import { extractStage, parseSevenZipList } from '../src/stages/extract.js'
import { VtClient, judgeStats, scanFile } from '../src/stages/virustotal.js'
import { ConfigError, checkClaudeUserSettings, loadConfig, parseWrapper } from '../src/config.js'
import { escapeForList } from '../src/util.js'
import { FIXTURES, fakeBin, response, sha, tempDir } from './helpers.mjs'

const LIMITS = { sourceFileBytes: 100, sourceTextFiles: 3, sourceTextBytes: 250 }
const file = (p, content) => ({ path: `root/${p}`, type: 'file', size: Buffer.byteLength(content), sha256: sha(content),
  content: Buffer.from(content), head: Buffer.from(content) })

test('SourceCollector: שמות מספריים, בינאריים וקישורים ברשימה, ותיקיית שורש אחת', async (t) => {
  const dir = await tempDir(t)
  const c = new SourceCollector(dir, LIMITS)
  await c.add('o/r', file('CLAUDE.md', 'approve me'), 'root')
  await c.add('o/r', file('.mcp.json', '{}'), 'root')
  await c.add('o/r', { path: 'root/x.bin', type: 'file', size: 3, sha256: 'h', content: Buffer.from([0, 1, 2]), head: Buffer.from([0, 1, 2]) }, 'root')
  await c.add('o/r', { path: 'root/l', type: 'symlink', size: 0, linkname: '/etc' }, 'root')
  assert.deepEqual((await readdir(dir)).sort(), ['1.txt', '2.txt'])
  assert.deepEqual(c.rows.map((r) => [r.n, r.kind, r.path]), [[1, 'text', 'o/r/CLAUDE.md'], [2, 'text', 'o/r/.mcp.json'],
    [null, 'binary', 'o/r/x.bin'], [null, 'symlink', 'o/r/l']])
  await assert.rejects(c.add('o/r', file('a', 'x'), 'otherroot'))
})

test('SourceCollector: חריגה ממגבלות המקור נזרקת (לא אישור חלקי)', async (t) => {
  const dir = await tempDir(t)
  const big = new SourceCollector(dir, LIMITS)
  await assert.rejects(big.add('o/r', file('big.js', 'x'.repeat(101)), 'root'), SourceLimitError)
  const many = new SourceCollector(dir, LIMITS)
  for (let i = 0; i < 3; i++) await many.add('o/r', file(`f${i}`, 'a'), 'root')
  await assert.rejects(many.add('o/r', file('f3', 'a'), 'root'), SourceLimitError)
  const bytes = new SourceCollector(dir, LIMITS)
  await bytes.add('o/r', file('a', 'x'.repeat(100)), 'root')
  await bytes.add('o/r', file('b', 'x'.repeat(100)), 'root')
  await assert.rejects(bytes.add('o/r', file('c', 'x'.repeat(60)), 'root'), SourceLimitError)
  // קובץ טקסט גדול שהתוכן שלו לא נשמר בזיכרון (רק head) — עדיין חריגה
  const head = new SourceCollector(dir, LIMITS)
  await assert.rejects(head.add('o/r', { path: 'root/h.js', type: 'file', size: 5000, sha256: 'h', content: null, head: Buffer.from('text') }, 'root'),
    SourceLimitError)
  assert.equal(looksLikeText(Buffer.from('שלום\n')), true)
  assert.equal(looksLikeText(Buffer.from([0x41, 0, 0x42])), false)
})

test('DIFF: נוספו/הוסרו/שונו כולל בינאריים ותלויות, ו-diff מאוחד לטקסט', async (t) => {
  const dir = await tempDir(t)
  const prevDir = path.join(dir, 'prev')
  const curDir = path.join(dir, 'cur')
  await mkdir(prevDir)
  await mkdir(curDir)
  await writeFile(path.join(prevDir, '1.txt'), 'a\nb\nc\n')
  await writeFile(path.join(curDir, '1.txt'), 'a\nB\nc\n')
  await writeFile(path.join(curDir, '2.txt'), '{"dependencies":{}}\n')
  const previous = { dir: prevDir, rows: [
    { n: 1, path: 'o/r/src/a.js', kind: 'text', sha256: '1' },
    { n: null, path: 'o/r/bin/tool.exe', kind: 'binary', sha256: 'x' },
    { n: null, path: 'o/r/old.txt', kind: 'binary', sha256: 'y' },
  ] }
  const current = { dir: curDir, rows: [
    { n: 1, path: 'o/r/src/a.js', kind: 'text', sha256: '2' },
    { n: null, path: 'o/r/bin/tool.exe', kind: 'binary', sha256: 'z' },
    { n: 2, path: 'o/r/package.json', kind: 'text', sha256: '3' },
  ] }
  const text = await buildDiffText({ previous, current, previousLabel: 'prev' })
  assert.match(text, /^\+ o\/r\/package\.json\tfiles\/2\.txt \[dependency\]$/m)
  assert.match(text, /^- o\/r\/old\.txt\tbinary$/m)
  assert.match(text, /^~ o\/r\/bin\/tool\.exe\tbinary\t\(binary -> binary\)$/m)
  assert.match(text, /^- b$/m)
  assert.match(text, /^\+ B$/m)
  assert.match(await buildDiffText({ previous: null, current }), /סקירה מלאה/)
})

// ---------------------------------------------------------------- extract / clamav

const PLUGIN = Buffer.from('the plugin')
async function extractCtx(t, { scenario, installerName = 'setup.zip', installer = Buffer.from('installer'), plugin = PLUGIN } = {}) {
  const dir = await tempDir(t)
  const scenarioFile = path.join(dir, '7z.json')
  await writeFile(scenarioFile, JSON.stringify(scenario))
  const job = { reviewId: 'f'.repeat(24), leaseToken: 't', kind: 'service', manifestDigest: 'd', receipts: [],
    plugin: { size: plugin.length, sha256: sha(plugin) },
    assets: [{ key: 'native0', name: installerName, size: installer.length, sha256: sha(installer), bundledPluginPath: 'app/plugin.otzplugin' }],
    submission: { sources: [] } }
  const config = { dataDir: path.join(dir, 'data'), sevenZip: fakeBin('fake-7z.mjs', scenarioFile),
    clamscan: fakeBin('fake-clamscan.mjs', scenarioFile), sandboxWrapper: null }
  const ctx = new JobContext({ job, config, api: null, signal: new AbortController().signal })
  await mkdir(ctx.paths.assetsDir, { recursive: true })
  await mkdir(ctx.paths.tmpDir, { recursive: true })
  await writeFile(path.join(ctx.paths.assetsDir, localAssetName('plugin', 'plugin.otzplugin')), plugin)
  await writeFile(path.join(ctx.paths.assetsDir, localAssetName('native0', installerName)), installer)
  return { ctx, dir, scenarioFile }
}

test('extract: מקונן (PKG → Payload) נמצא בשכבה השנייה', async (t) => {
  const { ctx, dir, scenarioFile } = await extractCtx(t, { installerName: 'setup.pkg', scenario: {} })
  const pluginSrc = path.join(dir, 'p.bin')
  const payload = path.join(dir, 'payload.bin')
  await writeFile(pluginSrc, PLUGIN)
  await writeFile(payload, 'cpio')
  await writeFile(scenarioFile, JSON.stringify({ byName: {
    'native0.pkg': [{ path: 'Payload', size: 4, from: payload }],
    Payload: [{ path: 'app', dir: true }, { path: 'app/plugin.otzplugin', size: PLUGIN.length, from: pluginSrc }],
  } }))
  const data = await extractStage(ctx)
  assert.equal(data.results[0].foundAt, 'app/plugin.otzplugin')
  assert.equal(data.results[0].byContent, false)
})

test('extract: תוסף שונה בנתיב המוצהר → דחייה; לא נמצא → דחייה', async (t) => {
  const { ctx, dir, scenarioFile } = await extractCtx(t, { scenario: {} })
  const other = path.join(dir, 'other.bin')
  await writeFile(other, 'tampered!!')
  await writeFile(scenarioFile, JSON.stringify({ entries: [{ path: 'app/plugin.otzplugin', size: 10, from: other }] }))
  await assert.rejects(extractStage(ctx), (e) => e instanceof Rejection && /אינו זהה/.test(e.report))
  await writeFile(scenarioFile, JSON.stringify({ entries: [{ path: 'readme.txt', size: 10, from: other }] }))
  ctx.memo.clear()
  await assert.rejects(extractStage(ctx), (e) => e instanceof Rejection && /לא נמצא/.test(e.report))
})

test('extract: Inno Setup שאינו ניתן לחילוץ — הדוח מציין זאת במפורש', async (t) => {
  const installer = Buffer.concat([Buffer.from('MZ....'), Buffer.from('Inno Setup Setup Data (6.2.0)'), Buffer.alloc(100)])
  const { ctx } = await extractCtx(t, { installerName: 'setup.exe', installer, scenario: { exitCode: 2 } })
  await assert.rejects(extractStage(ctx), (e) => e instanceof Rejection && /Inno Setup/.test(e.report) && /NSIS, MSI או ZIP/.test(e.report))
})

test('extract: גודל מוצהר מעל המגבלה → דחייה לפני חילוץ', async (t) => {
  const { ctx, dir, scenarioFile } = await extractCtx(t, { scenario: {} })
  await writeFile(scenarioFile, JSON.stringify({ entries: [{ path: 'bomb', size: 3 * 1024 ** 3, from: path.join(dir, 'none') }] }))
  await assert.rejects(extractStage(ctx), (e) => e instanceof Rejection && /מגבלות/.test(e.report))
})

test('parseSevenZipList', () => {
  const parsed = parseSevenZipList('7-Zip\n\n--\nPath = a.zip\nType = zip\n\n----------\nPath = d\nFolder = +\nSize = 0\n\nPath = d/f\nFolder = -\nSize = 12\nCreated = \n\n')
  assert.equal(parsed.type, 'zip')
  assert.deepEqual(parsed.entries, [{ path: 'd', isDir: true, size: 0 }, { path: 'd/f', isDir: false, size: 12 }])
})

test('clamav: נקי, נגוע → דחייה, חריגת מגבלות → operator, קוד 2 → operator', async (t) => {
  const { ctx, scenarioFile } = await extractCtx(t, { scenario: {} })
  assert.equal((await clamavStage(ctx)).status, 'clean')
  await writeFile(scenarioFile, JSON.stringify({ exitCode: 1, found: ['Win.Test.EICAR_HDB-1'] }))
  await assert.rejects(clamavStage(ctx), (e) => e instanceof Rejection && /EICAR/.test(e.report))
  await writeFile(scenarioFile, JSON.stringify({ exitCode: 1, found: ['Heuristics.Limits.Exceeded.MaxFileSize'] }))
  await assert.rejects(clamavStage(ctx), (e) => e.failureClass === 'operator' && e.code === 'clamav_incomplete')
  await writeFile(scenarioFile, JSON.stringify({ exitCode: 2 }))
  await assert.rejects(clamavStage(ctx), (e) => e.failureClass === 'operator' && e.code === 'clamav_error')
  assert.deepEqual(parseClamOutput('/a/b c.exe: Eicar FOUND\nok'), [{ file: '/a/b c.exe', signature: 'Eicar' }])
})

// ---------------------------------------------------------------- VirusTotal

test('VirusTotal: דוח עדכני מנוצל, העלאה כשאין, 429 → המתנה ואז כשל זמני', async (t) => {
  const now = Math.floor(Date.now() / 1000)
  const fresh = { data: { attributes: { last_analysis_date: now, last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 60 } } } }
  const vt1 = new VtClient({ apiKey: 'k', fetchImpl: async () => response(JSON.stringify(fresh)), pollIntervalMs: 1, backoffMs: [1] })
  assert.equal((await scanFile(vt1, { sha256: 'a'.repeat(64) })).source, 'existing_report')

  const calls = []
  const vt429 = new VtClient({ apiKey: 'k', fetchImpl: async (url) => { calls.push(url); return response('', { status: 429 }) }, backoffMs: [1, 1] })
  await assert.rejects(scanFile(vt429, { sha256: 'a'.repeat(64) }), (e) => e.failureClass === 'transient' && e.code === 'virustotal_quota')
  assert.equal(calls.length, 3)

  const posted = []
  const uploadFetch = async (url, init) => {
    if (url.endsWith('/files/' + 'b'.repeat(64))) return response('', { status: 404 })
    if (url.endsWith('/api/v3/files') && init.method === 'POST') {
      posted.push(init.body instanceof FormData)
      return response(JSON.stringify({ data: { id: 'an-1' } }))
    }
    if (url.endsWith('/analyses/an-1')) {
      return response(JSON.stringify({ data: { attributes: { status: 'completed', stats: { malicious: 0, undetected: 40 } } } }))
    }
    return response('', { status: 500 })
  }
  const dir = await tempDir(t)
  const f = path.join(dir, 'f.bin')
  await writeFile(f, 'data')
  const up = await scanFile(new VtClient({ apiKey: 'k', fetchImpl: uploadFetch, pollIntervalMs: 1 }), { file: f, sha256: 'b'.repeat(64), size: 4 })
  assert.deepEqual([up.source, up.analysisId, posted], ['analysis', 'an-1', [true]])

  const vtAuth = new VtClient({ apiKey: 'k', fetchImpl: async () => response('', { status: 401 }) })
  await assert.rejects(scanFile(vtAuth, { sha256: 'a'.repeat(64) }), (e) => e.failureClass === 'operator')

  assert.equal(judgeStats({ malicious: 1 }), 'flagged')
  assert.equal(judgeStats({ suspicious: 2, undetected: 50 }), 'flagged')
  assert.equal(judgeStats({ timeout: 70 }), 'incomplete')
  assert.equal(judgeStats({ undetected: 70 }), 'clean')
})

// ---------------------------------------------------------------- config

const STRONG_SECRET = 'aB3-xY7_kL9.mN2~'.repeat(3)

test('תצורה: CLAUDE_AUTH_MODE חובה; api_key דורש מפתח; עטיפה כמערך JSON', () => {
  const base = { SERVICE_BROKER_SITE_URL: 'https://otzaria.org', SERVICE_PLUGIN_WORKER_SECRET: STRONG_SECRET,
    SERVICE_BROKER_DATA_DIR: path.resolve('/var/lib/broker') }
  assert.throws(() => loadConfig(base), (e) => e instanceof ConfigError && e.problems.some((p) => p.includes('CLAUDE_AUTH_MODE')))
  assert.throws(() => loadConfig({ ...base, CLAUDE_AUTH_MODE: 'api_key' }), ConfigError)
  const c = loadConfig({ ...base, CLAUDE_AUTH_MODE: 'subscription', ANTHROPIC_API_KEY: 'sk' })
  assert.equal(c.anthropicApiKey, '')
  assert.ok(c.warnings.length >= 2)
  assert.throws(() => loadConfig({ ...base, CLAUDE_AUTH_MODE: 'subscription', SERVICE_BROKER_SITE_URL: 'http://otzaria.org' }), ConfigError)
  assert.deepEqual(parseWrapper('["bwrap","--unshare-net","--"]'), ['bwrap', '--unshare-net', '--'])
  assert.deepEqual(parseWrapper('unshare -rn --'), ['unshare', '-rn', '--'])
  assert.equal(parseWrapper(''), null)
})

test('שם קובץ מקומי אינו לוקח דבר משם הקובץ של המפתח מלבד סיומת מוכרת', () => {
  assert.equal(localAssetName('native0', '../../evil.EXE'), 'native0.exe')
  assert.equal(localAssetName('native1', 'x.AppImage'), 'native1.appimage')
  assert.equal(localAssetName('native2', 'noext'), 'native2')
})

// ---------------------------------------------------------------- קידוד, קבצים בינאריים והתנגשויות נתיבים

const utf16 = (text, be = false) => {
  const body = Buffer.from(text, 'utf16le')
  if (be) body.swap16()
  return Buffer.concat([Buffer.from(be ? [0xfe, 0xff] : [0xff, 0xfe]), body])
}
const raw = (p, buf) => ({ path: `root/${p}`, type: 'file', size: buf.length, sha256: sha(buf), content: buf, head: buf.subarray(0, 8192) })

test('UTF-16 עם BOM נקרא כטקסט ונכתב כ-UTF-8', async (t) => {
  const dir = await tempDir(t)
  const c = new SourceCollector(dir, { ...LIMITS, sourceFileBytes: 1000 })
  await c.add('o/r', raw('Program.cs', utf16('Process.Start("cmd.exe");\r\n')), 'root')
  await c.add('o/r', raw('build.ps1', utf16('Invoke-WebRequest x\n', true)), 'root')
  assert.deepEqual(c.rows.map((r) => [r.kind, r.encoding]), [['text', 'utf-16le'], ['text', 'utf-16be']])
  assert.equal(await readFile(path.join(dir, '1.txt'), 'utf8'), 'Process.Start("cmd.exe");\r\n')
  assert.equal(decodeUtf16(Buffer.from([0xff, 0xfe, 0x41])), null)
  assert.equal(decodeUtf16(Buffer.from('plain')), null)
})

test('קובץ קוד/בנייה/מניפסט שתוכנו בינארי → דחייה; קובץ בינארי רגיל נרשם', async (t) => {
  const dir = await tempDir(t)
  const c = new SourceCollector(dir, LIMITS)
  const bin = Buffer.from([0x50, 0, 0x51, 0, 0x52, 1, 2])
  for (const p of ['src/index.js', 'package.json', '.github/workflows/build.yml', 'scripts/install.sh', 'Makefile', '.gitattributes']) {
    await assert.rejects(c.add('o/r', raw(p, bin), 'root'), (e) => e instanceof SourceFormatError && /קוד, בנייה או תלויות/.test(e.message), p)
  }
  await c.add('o/r', raw('assets/logo.png', bin), 'root')
  assert.deepEqual(c.rows.map((r) => r.kind), ['binary'])
})

test('התנגשות נתיבים ברישיות או בנרמול Unicode, או נתיב כפול → דחייה', async (t) => {
  const dir = await tempDir(t)
  const cases = [
    ['src/Main.js', 'src/main.js'],
    ['Src/a.js', 'src/b.js'],
    ['lib', 'LIB/x.js'],
    ['café.js', 'café.js'],
    ['dup.js', 'dup.js'],
  ]
  for (const [a, b] of cases) {
    const c = new SourceCollector(dir, { ...LIMITS, sourceTextFiles: 100 })
    await c.add('o/r', file(a, 'x'), 'root')
    await assert.rejects(c.add('o/r', file(b, 'y'), 'root'), (e) => e instanceof SourceFormatError && /מתנגשים/.test(e.message), `${a} / ${b}`)
  }
  const ok = new SourceCollector(dir, { ...LIMITS, sourceTextFiles: 100 })
  await ok.add('o/r', { path: 'root/src/', type: 'directory', size: 0 }, 'root')
  await ok.add('o/r', file('src/a.js', 'x'), 'root')
  await ok.add('o/r', file('src/b.js', 'y'), 'root')
})

test('DIFF: שורות תוכן אינן מזייפות כותרות, ותווים בלתי נראים מוצגים', async (t) => {
  const dir = await tempDir(t)
  const prevDir = path.join(dir, 'prev')
  const curDir = path.join(dir, 'cur')
  await mkdir(prevDir)
  await mkdir(curDir)
  const ch = (n) => String.fromCharCode(n)
  await writeFile(path.join(prevDir, '1.txt'), 'a\n-- fake.js\nc\n')
  await writeFile(path.join(curDir, '1.txt'), `a\n++ evil.js\n@@ -1 +1 @@\nx${ch(0x202e)}y${ch(0x2028)}z${ch(0x200b)}\rq\nc\n`)
  const rows = [{ n: 1, path: 'o/r/a.js', kind: 'text', sha256: '1' }]
  const text = await buildDiffText({ previous: { dir: prevDir, rows }, current: { dir: curDir, rows: [{ ...rows[0], sha256: '2' }] }, previousLabel: 'p' })
  const body = text.slice(text.indexOf('## diff'))
  assert.equal(body.split('\n').filter((l) => /^(---|\+\+\+|@@)/.test(l)).length, 3)
  assert.match(body, /^- -- fake\.js$/m)
  assert.match(body, /^\+ \+\+ evil\.js$/m)
  assert.match(body, /^\+ @@ -1 \+1 @@$/m)
  assert.match(body, /^\+ x\\u202ey\\u2028z\\u200b\\u000dq$/m)
  assert.equal(escapeForList(`a${ch(0x85)}b${ch(0x2029)}c${ch(0xfeff)}`), 'a\\u0085b\\u2029c\\ufeff')
})

// ---------------------------------------------------------------- בידוד ו-7-Zip

test('חילוץ שכותב יותר מהמוצהר (ISIZE מזויף) נעצר תוך כדי ונדחה', async (t) => {
  const { ctx, scenarioFile } = await extractCtx(t, { installerName: 'setup.gz', scenario: {} })
  await writeFile(scenarioFile, JSON.stringify({ type: 'gzip', entries: [{ path: 'setup', size: 10 }],
    inflate: { chunk: 256 * 1024, total: 64 * 1024 * 1024 } }))
  ctx.config.extractLimits = { maxBytes: 1024 * 1024, maxEntries: 100, maxDepth: 3 }
  ctx.config.extractPollMs = 50
  const started = Date.now()
  await assert.rejects(extractStage(ctx), (e) => e instanceof Rejection && /חולץ בפועל/.test(e.report))
  assert.ok(Date.now() - started < 15_000)
})

test('עטיפת הבידוד מקבלת לכל הפעלה רק את הקלט ותיקיית הפלט שלה', async (t) => {
  const { ctx, dir, scenarioFile } = await extractCtx(t, { scenario: {} })
  const pluginSrc = path.join(dir, 'p.bin')
  await writeFile(pluginSrc, PLUGIN)
  await writeFile(scenarioFile, JSON.stringify({ entries: [{ path: 'app/plugin.otzplugin', size: PLUGIN.length, from: pluginSrc }] }))
  const record = path.join(dir, 'sandbox.record')
  ctx.config.sandboxWrapper = [process.execPath, path.join(FIXTURES, 'sandbox-recorder.mjs'), record, '--ro-bind', '{in}', '--bind', '{out}', '--']
  await extractStage(ctx)
  await clamavStage(ctx)
  const calls = (await readFile(record, 'utf8')).trim().split('\n').map((l) => JSON.parse(l))
  const installer = ctx.localPath(ctx.job.assets[0])
  assert.deepEqual(calls[0], ['--ro-bind', installer, '--bind', path.join(ctx.paths.tmpDir, 'list')])
  assert.deepEqual(calls[1], ['--ro-bind', installer, '--bind', path.join(ctx.paths.extractDir, 'native0', 'L0')])
  assert.deepEqual(calls.at(-1), ['--ro-bind', ctx.paths.assetsDir, '--bind', path.join(ctx.paths.tmpDir, 'clamav')])
  for (const c of calls) assert.ok(!c.some((x) => x.startsWith(path.dirname(ctx.paths.privateDir))))
})

// ---------------------------------------------------------------- תצורה: סודות, בידוד בפרודקשן והגדרות Claude

test('חוזק סוד המתווך זהה לבדיקה של האתר', async () => {
  const { isStrongWorkerSecret } = await import('../../../src/lib/servicePlugins/workerAuth.js')
  const base = { SERVICE_BROKER_SITE_URL: 'https://otzaria.org', SERVICE_BROKER_DATA_DIR: path.resolve('/var/lib/broker'),
    CLAUDE_AUTH_MODE: 'subscription' }
  for (const secret of ['x'.repeat(50), 'aB3-xY7_'.repeat(5), 'aB3 xY7_kL9.mN2~'.repeat(3), `${'aB3-xY7_'.repeat(128)}z`, STRONG_SECRET]) {
    const ok = (() => {
      try {
        loadConfig({ ...base, SERVICE_PLUGIN_WORKER_SECRET: secret })
        return true
      } catch {
        return false
      }
    })()
    assert.equal(ok, isStrongWorkerSecret(secret), secret.slice(0, 20))
  }
  assert.throws(() => loadConfig({ ...base, SERVICE_PLUGIN_WORKER_SECRET: 'x'.repeat(50) }), ConfigError)
})

test('סודות מ-CREDENTIALS_DIRECTORY קודמים לסביבה', async (t) => {
  const dir = await tempDir(t)
  await writeFile(path.join(dir, 'SERVICE_PLUGIN_WORKER_SECRET'), `${STRONG_SECRET}\n`)
  await writeFile(path.join(dir, 'GH_TOKEN'), 'gh-from-cred\n')
  await writeFile(path.join(dir, 'ANTHROPIC_API_KEY'), 'sk-from-cred')
  const c = loadConfig({ SERVICE_BROKER_SITE_URL: 'https://otzaria.org', SERVICE_BROKER_DATA_DIR: path.resolve('/var/lib/broker'),
    CLAUDE_AUTH_MODE: 'api_key', CREDENTIALS_DIRECTORY: dir, SERVICE_PLUGIN_WORKER_SECRET: 'weak', GH_TOKEN: 'gh-from-env',
    VT_API_KEY: 'vt-from-env' })
  assert.deepEqual([c.workerSecret, c.ghToken, c.anthropicApiKey, c.vtApiKey], [STRONG_SECRET, 'gh-from-cred', 'sk-from-cred', 'vt-from-env'])
})

test('בפרודקשן אין עלייה בלי SANDBOX_WRAPPER, אלא אם unsafe-none במפורש', () => {
  const base = { SERVICE_BROKER_SITE_URL: 'https://otzaria.org', SERVICE_PLUGIN_WORKER_SECRET: STRONG_SECRET,
    SERVICE_BROKER_DATA_DIR: path.resolve('/var/lib/broker'), CLAUDE_AUTH_MODE: 'subscription', NODE_ENV: 'production' }
  assert.throws(() => loadConfig(base), (e) => e instanceof ConfigError && e.problems.some((p) => p.includes('SANDBOX_WRAPPER')))
  const unsafe = loadConfig({ ...base, SANDBOX_WRAPPER: 'unsafe-none' })
  assert.equal(unsafe.sandboxWrapper, null)
  assert.ok(unsafe.warnings.some((w) => w.startsWith('!!!')))
  const tpl = loadConfig({ ...base, SANDBOX_WRAPPER: '["bwrap","--ro-bind","{in}","{in}","--bind","{out}","{out}","--"]' })
  assert.ok(!tpl.warnings.some((w) => w.includes('{in}')))
  assert.ok(loadConfig({ ...base, SANDBOX_WRAPPER: 'unshare -rn --' }).warnings.some((w) => w.includes('{in}')))
})

test('הגדרות Claude של משתמש המתווך: hooks / permissions.allow / additionalDirectories אסורים', async (t) => {
  const home = await tempDir(t)
  const config = { home, claudeConfigDir: '' }
  assert.deepEqual(checkClaudeUserSettings(config), [])
  await mkdir(path.join(home, '.claude'))
  const write = (v) => writeFile(path.join(home, '.claude', 'settings.json'), JSON.stringify(v))
  await write({ theme: 'dark', hooks: {}, permissions: { deny: ['Read(/etc/**)'], allow: [] } })
  assert.deepEqual(checkClaudeUserSettings(config), [])
  for (const bad of [{ hooks: { PreToolUse: [] } }, { permissions: { allow: ['Read(/**)'] } }, { permissions: { additionalDirectories: ['/'] } },
    { additionalDirectories: ['/etc'] }]) {
    await write(bad)
    assert.equal(checkClaudeUserSettings(config).length, 1, JSON.stringify(bad))
  }
  await writeFile(path.join(home, '.claude', 'settings.json'), '{not json')
  assert.equal(checkClaudeUserSettings(config).length, 1)
})
