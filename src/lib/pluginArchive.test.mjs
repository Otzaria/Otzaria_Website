import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { readPluginZipDirectory, extractZipFiles, readPluginManifest } from './pluginArchive.js'
import { MAX_PLUGIN_BYTES, MAX_PLUGIN_ENTRIES, MAX_PLUGIN_MANIFEST_BYTES, MAX_PLUGIN_CODE_BYTES } from './pluginLimits.js'

const archive = (entries = { 'manifest.json': strToU8('{"id":"test"}') }, options) => Buffer.from(zipSync(entries, options))
const cd = (b) => b.readUInt32LE(b.length - 6)
function mutate(fn, options) { const b = archive(undefined, options); fn(b, cd(b), b.length - 22); return b }

for (const level of [0, 6, 9]) {
  test(`reads ZIP compression level ${level}`, () => {
    const b = archive({ 'manifest.json': strToU8('\uFEFF{"id":"test"}'), 'index.html': strToU8('hello') }, { level })
    assert.equal(readPluginManifest(b).id, 'test')
    assert.equal(extractZipFiles(b).get('index.html').toString(), 'hello')
  })
}
test('accepts UTF-8 names and directory entries', () => {
  const b = archive({ 'dir/': new Uint8Array(), 'dir/עברית.txt': strToU8('שלום') })
  assert.equal(extractZipFiles(b).get('dir/עברית.txt').toString(), 'שלום')
  assert.equal(extractZipFiles(b).has('dir/'), false)
})
test('accepts an EOCD comment', () => {
  const b = archive(); b.writeUInt16LE(3, b.length - 2)
  assert.equal(readPluginManifest(Buffer.concat([b, Buffer.from('abc')])).id, 'test')
})
test('accepts data-descriptor entries with lengths from the central directory', () => {
  const b = archive(); const pos = cd(b)
  b.writeUInt16LE(b.readUInt16LE(6) | 8, 6); b.writeUInt16LE(b.readUInt16LE(pos + 8) | 8, pos + 8)
  b.writeUInt32LE(0, 18); b.writeUInt32LE(0, 22)
  assert.equal(readPluginManifest(b).id, 'test')
})
test('predicate skips inflation of unrelated assets', () => {
  const b = archive({ 'manifest.json': strToU8('{}'), 'asset.bin': strToU8('asset') })
  assert.deepEqual([...extractZipFiles(b, n => n === 'manifest.json').keys()], ['manifest.json'])
})
test('validates oversized metadata even for a skipped asset', () => {
  const b = archive({ 'asset.bin': new Uint8Array() })
  b.writeUInt32LE(0xffffffff, cd(b) + 24)
  assert.throws(() => extractZipFiles(b, () => false), /size limit/)
})
test('rejects total expanded size above the budget', () => {
  const b = archive(Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`asset${i}.bin`, new Uint8Array()])))
  let pos = cd(b)
  for (let i = 0; i < 4; i++) {
    b.writeUInt32LE(40 * 1024 * 1024, pos + 24)
    b.writeUInt32LE(40 * 1024 * 1024, b.readUInt32LE(pos + 42) + 22)
    pos += 46 + b.readUInt16LE(pos + 28)
  }
  assert.throws(() => readPluginZipDirectory(b), /size limit/)
})
test('rejects compressed uploads above 50MB before parsing', () => {
  assert.throws(() => readPluginZipDirectory(Buffer.alloc(MAX_PLUGIN_BYTES + 1)), /compressed size/)
})
test('rejects too many entries', () => {
  const b = mutate((b, _pos, end) => { b.writeUInt16LE(MAX_PLUGIN_ENTRIES + 1, end + 8); b.writeUInt16LE(MAX_PLUGIN_ENTRIES + 1, end + 10) })
  assert.throws(() => readPluginZipDirectory(b), /too many/)
})
test('bounds manifest inflation even when metadata lies about its size', () => {
  const b = archive({ 'manifest.json': strToU8(' '.repeat(1024 * 1024)) })
  b.writeUInt32LE(10, cd(b) + 24)
  b.writeUInt32LE(10, 22)
  assert.throws(() => readPluginManifest(b), /larger|size|length/i)
})
test('bounds code inflation even when metadata lies about its size', () => {
  const b = archive({ 'index.js': strToU8('x'.repeat(1024 * 1024)) })
  b.writeUInt32LE(10, cd(b) + 24)
  b.writeUInt32LE(10, 22)
  assert.throws(() => extractZipFiles(b), /larger|size|length/i)
})
test('rejects output shorter than its advertised size', () => {
  const b = mutate((b, pos) => { b.writeUInt32LE(100, pos + 24); b.writeUInt32LE(100, 22) })
  assert.throws(() => readPluginManifest(b), /size mismatch/)
})
test('allows an empty deflated entry', () => {
  assert.equal(extractZipFiles(archive({ 'empty.txt': new Uint8Array() })).get('empty.txt').length, 0)
})
test('requires an object manifest', () => {
  for (const text of ['null', '[]', '42', '"text"']) assert.throws(() => readPluginManifest(archive({ 'manifest.json': strToU8(text) })), /JSON object/)
})
test('rejects malformed JSON', () => assert.throws(() => readPluginManifest(archive({ 'manifest.json': strToU8('{') }))))
test('requires manifest.json at the archive root', () => assert.throws(() => readPluginManifest(archive({ 'nested/manifest.json': strToU8('{}') })), /not found/))

const malformed = [
  ['multivolume', (b, p, e) => b.writeUInt16LE(1, e + 4)],
  ['different directory volume', (b, p, e) => b.writeUInt16LE(1, e + 6)],
  ['different entry count', (b, p, e) => b.writeUInt16LE(0, e + 8)],
  ['directory outside the file', (b, p, e) => b.writeUInt32LE(0xffffffff, e + 16)],
  ['invalid directory size', (b, p, e) => b.writeUInt32LE(0xffffffff, e + 12)],
  ['bad directory signature', (b, p) => b.writeUInt32LE(0, p)],
  ['bad filename length', (b, p) => b.writeUInt16LE(65535, p + 28)],
  ['bad extra length', (b, p) => b.writeUInt16LE(65535, p + 30)],
  ['bad comment length', (b, p) => b.writeUInt16LE(65535, p + 32)],
  ['entry on another volume', (b, p) => b.writeUInt16LE(1, p + 34)],
  ['encrypted entry', (b, p) => b.writeUInt16LE(1, p + 8)],
  ['unsupported compression', (b, p) => b.writeUInt16LE(99, p + 10)],
  ['huge manifest', (b, p) => b.writeUInt32LE(MAX_PLUGIN_MANIFEST_BYTES + 1, p + 24)],
  ['bad local offset', (b, p) => b.writeUInt32LE(0xffffffff, p + 42)],
  ['bad local signature', b => b.writeUInt32LE(0, 0)],
  ['different local method', b => b.writeUInt16LE(99, 8)],
  ['different local flags', b => b.writeUInt16LE(1, 6)],
  ['different local name', b => { b[30] = 120 }],
  ['bad local extra length', b => b.writeUInt16LE(65535, 28)],
  ['compressed data past the directory', (b, p) => b.writeUInt32LE(0xffffffff, p + 20)],
]
for (const [name, change] of malformed) test(`rejects ${name}`, () => assert.throws(() => readPluginZipDirectory(mutate(change))))
for (const input of [Buffer.alloc(0), Buffer.alloc(21), Buffer.from('not a zip')]) {
  test(`rejects truncated input of ${input.length} bytes`, () => assert.throws(() => readPluginZipDirectory(input)))
}
for (const name of ['../escape.js', '/absolute.js', 'dir/../escape.js', 'dir\\escape.js', 'nul\0.js']) {
  test(`rejects unsafe ZIP name ${JSON.stringify(name)}`, () => assert.throws(() => readPluginZipDirectory(archive({ [name]: strToU8('x') }))))
}
for (const name of ['index.js', 'index.html', 'index.css', 'index.vue']) {
  test(`enforces code budget for ${name}`, () => {
    const b = archive({ [name]: new Uint8Array() }); b.writeUInt32LE(MAX_PLUGIN_CODE_BYTES + 1, cd(b) + 24)
    assert.throws(() => readPluginZipDirectory(b), /size limit/)
  })
}
test('rejects duplicate central directory names', () => {
  const b = archive({ 'a.js': strToU8('a'), 'b.js': strToU8('b') })
  const second = cd(b) + 46 + 4; b[second + 46] = 97; b[b.readUInt32LE(second + 42) + 30] = 97
  assert.throws(() => readPluginZipDirectory(b), /duplicate/)
})
test('rejects stored-size mismatches', () => assert.throws(() => readPluginZipDirectory(mutate((b, p) => b.writeUInt32LE(1, p + 24), { level: 0 })), /stored size/))
test('rejects nonempty directory entries', () => assert.throws(() => readPluginZipDirectory(archive({ 'dir/': strToU8('x') })), /nonempty/))
test('rejects corrupt stored content by CRC32', () => {
  const b = archive(undefined, { level: 0 }); b[30 + 'manifest.json'.length + 2] ^= 1
  assert.throws(() => readPluginManifest(b), /CRC32/)
})
for (const offset of [14, 18, 22]) {
  test(`rejects inconsistent local header field at ${offset}`, () => {
    assert.throws(() => readPluginZipDirectory(mutate(b => b.writeUInt32LE(999, offset))), /local sizes or checksum/)
  })
}
