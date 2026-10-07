import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import OcrJob from '../models/OcrJob.js'
const require = createRequire(import.meta.url)
const { load } = require('js-yaml')
const { zipSync } = require('fflate')
const { checkProductionTrace } = require('../../scripts/check-production-trace.cjs')
const workflow = load(fs.readFileSync('.github/workflows/deploy.yml', 'utf8'))

test('CI has a healthy isolated Mongo service and bounded selection deadline', () => {
  const job = workflow.jobs['build-check']
  assert.equal(job.env.MONGODB_URI, 'mongodb://127.0.0.1:27017/otzaria_ci')
  assert.equal(job.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, '5000')
  assert.equal(job.services.mongodb.image, 'mongo:8.0')
  assert.deepEqual(job.services.mongodb.ports, ['27017:27017'])
  assert.match(job.services.mongodb.options, /mongosh.*ping:1/)
  assert.equal(workflow.jobs.deploy.env, undefined)
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
})
test('validator marker is conditional and follows successful SSH deployment', () => {
  const steps = workflow.jobs.deploy.steps
  const deploy = steps.findIndex(s => s.name === 'Deploy using SSH')
  const marker = steps.findIndex(s => s.name === 'Check the deployed validator marker')
  const save = steps.find(s => s.uses?.startsWith('actions/cache/save@'))
  assert.ok(marker > deploy)
  assert.equal(steps[marker].with['lookup-only'], true)
  assert.equal(save.if, "steps.marker.outputs.cache-hit != 'true'")
  assert.equal(workflow.jobs['mark-deployed'], undefined)
  assert.ok(workflow.jobs['build-check'].steps.some(s => s.run === 'npm run test:deployment-regressions'))
})
test('migration parses without running data writes and restores the async function boundary', () => {
  execFileSync(process.execPath, ['--check', 'scripts/migrate-old-data-improved.js'], { timeout: 10000 })
  const source = fs.readFileSync('scripts/migrate-old-data-improved.js', 'utf8')
  const { parse } = require('hermes-parser')
  const ast = parse(source, { sourceType: 'script' })
  const books = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id?.name === 'migrateBooksAndPages')
  assert.equal(books?.async, true)
  assert.ok(books.body.body.some(n => n.type === 'VariableDeclaration'))
})
test('OCR keeps exactly one book index with the running-only unique constraint', () => {
  const indexes = OcrJob.schema.indexes()
  const book = indexes.filter(([keys]) => JSON.stringify(keys) === JSON.stringify({ book: 1 }))
  assert.equal(book.length, 1)
  assert.equal(book[0][1].unique, true)
  assert.deepEqual(book[0][1].partialFilterExpression, { status: 'running' })
  assert.ok(indexes.some(([keys]) => keys.book === 1 && keys.createdAt === -1))
})
test('malformed ZIP64 no longer freezes fflate admin/browser extraction', () => {
  let zip = Buffer.from(zipSync({ 'data.txt': Buffer.from('hello') }))
  const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  assert.ok(central >= 0)
  zip.writeUInt32LE(0xffffffff, central + 20)
  // Mark the archive as ZIP64, but omit the required per-entry size field.
  // Without the ZIP64 locator the old parser does not enter its vulnerable loop.
  const end = zip.length - 22
  zip.writeUInt32LE(0xffffffff, end + 16)
  const zip64 = Buffer.alloc(56)
  zip64.writeUInt32LE(0x06064b50, 0)
  zip64.writeBigUInt64LE(44n, 4)
  zip64.writeBigUInt64LE(1n, 24)
  zip64.writeBigUInt64LE(1n, 32)
  zip64.writeBigUInt64LE(BigInt(end - central), 40)
  zip64.writeBigUInt64LE(BigInt(central), 48)
  const locator = Buffer.alloc(20)
  locator.writeUInt32LE(0x07064b50, 0)
  locator.writeBigUInt64LE(BigInt(end), 8)
  locator.writeUInt32LE(1, 16)
  zip = Buffer.concat([zip.subarray(0, end), zip64, locator, zip.subarray(end)])
  const code = "const {unzipSync}=require('fflate');try{unzipSync(Buffer.from(process.argv[1],'base64'));process.exitCode=1}catch{}"
  execFileSync(process.execPath, ['-e', code, zip.toString('base64')], { timeout: 3000 })
})
test('Nodemailer 10 composes Unicode mail with attachments offline', async () => {
  const nodemailer = require('nodemailer')
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  const result = await transport.sendMail({ from: 'sender@example.test', to: 'recipient@example.test', subject: 'בדיקת אוצריא', text: 'שלום', html: '<p>שלום</p>', attachments: [{ filename: 'hello.txt', content: 'test' }] })
  assert.deepEqual(result.envelope.to, ['recipient@example.test'])
  assert.match(result.message.toString(), /multipart\/mixed/)
  assert.match(result.message.toString(), /hello\.txt/)
  transport.close()
  const { createSmtpTransport, createCustomSmtpTransport } = await import('./smtp-transport.js')
  const smtp = createSmtpTransport()
  assert.equal(smtp.options.connectionTimeout, 10000)
  assert.equal(smtp.options.tls.rejectUnauthorized, true)
  const pool = createCustomSmtpTransport('test')
  assert.equal(pool.options.pool, true); assert.equal(pool, createCustomSmtpTransport('test'))
  smtp.close(); pool.close()
})

function traceFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'otzaria-trace-test-'))
  const required = ['scripts/plugin-validation-worker.mjs', 'src/lib/pluginValidationCore.js', 'src/lib/pluginArchive.js', 'src/lib/pluginLimits.js', 'node_modules/otzaria-plugin-validator/src/index.js', 'node_modules/otzaria-plugin-validator/src/spec.json', 'node_modules/otzaria-plugin-validator/package.json']
  const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data) }
  for (const file of required) write(path.join(root, file), file.endsWith('package.json') ? '{"main":"src/index.js"}' : '{}')
  const traces = ['plugins/upload', 'plugins/[id]/edit', 'admin/plugins/[id]/edit'].map(route => path.join(root, '.next/server/app/api', route, 'route.js.nft.json'))
  for (const file of traces) write(file, JSON.stringify({ files: required.map(item => path.relative(path.dirname(file), path.join(root, item))) }))
  return { root, traces, clean: () => fs.rmSync(root, { recursive: true, force: true }) }
}
test('production trace guard accepts complete worker dependencies for all entry routes', () => {
  const f = traceFixture()
  try { checkProductionTrace(f.root) } finally { f.clean() }
})
test('production trace guard rejects an alias missing its worker', () => {
  const f = traceFixture()
  try {
    const trace = JSON.parse(fs.readFileSync(f.traces[1])); trace.files = trace.files.filter(file => !file.endsWith('plugin-validation-worker.mjs'))
    fs.writeFileSync(f.traces[1], JSON.stringify(trace))
    assert.throws(() => checkProductionTrace(f.root), /absent from plugins\/\[id\]\/edit/)
  } finally { f.clean() }
})
test('production trace guard rejects a missing SDK specification', () => {
  const f = traceFixture()
  try {
    fs.unlinkSync(path.join(f.root, 'node_modules/otzaria-plugin-validator/src/spec.json'))
    assert.throws(() => checkProductionTrace(f.root), /ENOENT/)
  } finally { f.clean() }
})
for (const relativeTrace of ['.next/server/unrelated.nft.json', '.next/next-server.js.nft.json']) {
test(`production trace guard rejects mutable user data in ${relativeTrace}`, () => {
  const f = traceFixture()
  try {
    const file = path.join(f.root, relativeTrace)
    fs.writeFileSync(file, JSON.stringify({ files: [path.relative(path.dirname(file), path.join(f.root, 'storage/private.json'))] }))
    assert.throws(() => checkProductionTrace(f.root), /Mutable runtime data/)
  } finally { f.clean() }
})
}
