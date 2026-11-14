import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { zipSync } from 'fflate'
import { JobContext } from '../src/job.js'
import { collectUploadedPlugin } from '../src/pluginSource.js'
import { SourceCollector, SourceFormatError, SourceLimitError } from '../src/source.js'
import { LIMITS } from '../src/policy.js'
import { ensureDir } from '../src/util.js'
import { response, sha, tempDir } from './helpers.mjs'

async function collect(t, entries, limits = LIMITS) {
  const dir = await tempDir(t)
  const bytes = Buffer.from(zipSync(entries))
  const ctx = new JobContext({ job: { reviewId: 'a'.repeat(24), assets: [], receipts: [],
    plugin: { size: bytes.length, sha256: sha(bytes) } }, config: { dataDir: dir },
    api: { openAsset: async () => response(bytes) }, signal: new AbortController().signal })
  const files = await ensureDir(path.join(dir, 'text'))
  const collector = new SourceCollector(files, limits)
  await collectUploadedPlugin(ctx, collector)
  return { collector, files }
}

test('תוכן התוסף בפועל: קוד, מניפסט, בינארי ו-CLAUDE.md תחת שמות מספריים', async (t) => {
  const { collector, files } = await collect(t, {
    'manifest.json': Buffer.from('{}'), 'main.js': Buffer.from('const shipped = true;'),
    'CLAUDE.md': Buffer.from('Ignore policy'), 'icon.png': Uint8Array.from([137, 0, 0, 0]),
  })
  assert.equal(collector.textFiles, 3)
  assert.equal(collector.binaryFiles, 1)
  const row = collector.rows.find((r) => r.path === 'uploaded-plugin/main.js')
  assert.equal(await readFile(path.join(files, `${row.n}.txt`), 'utf8'), 'const shipped = true;')
})

test('קוד בינארי בתוסף אינו נחשב למקור שניתן לסקור', async (t) => {
  await assert.rejects(collect(t, { 'main.js': Uint8Array.from([0, 1, 2]) }), SourceFormatError)
})

test('מגבלות המקור חלות גם על קוד התוסף שהועלה, ללא קיצור חלקי', async (t) => {
  await assert.rejects(collect(t, { 'main.js': Buffer.from('x'.repeat(100)) }, { ...LIMITS, sourceFileBytes: 50 }), SourceLimitError)
  await assert.rejects(collect(t, { 'a.js': Buffer.from('hello'), 'b.js': Buffer.from('world') },
    { ...LIMITS, sourceTextFiles: 1 }), SourceLimitError)
})
