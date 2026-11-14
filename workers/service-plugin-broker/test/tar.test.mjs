import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TarError, normalizeEntryPath, readTarGz } from '../src/tar.js'
import { chunked, gitSha, makeTarGz, sha } from './helpers.mjs'

async function readAll(buf, limits) {
  const entries = []
  const result = await readTarGz(chunked(buf), { limits, onEntry: (e) => entries.push(e) })
  return { entries, result }
}

test('קורא קבצים רגילים עם תוכן ו-SHA-256, גם כשהזרם מפוצל', async () => {
  const big = 'x'.repeat(5000)
  const gz = makeTarGz([
    { name: 'root/', type: '5' },
    { name: 'root/a.txt', content: 'hello\n' },
    { name: 'root/sub/big.js', content: big },
  ], { globalPax: { comment: 'a'.repeat(40) } })
  const { entries, result } = await readAll(gz)
  const files = entries.filter((e) => e.type === 'file')
  assert.deepEqual(files.map((f) => f.path), ['root/a.txt', 'root/sub/big.js'])
  assert.equal(files[0].content.toString(), 'hello\n')
  assert.equal(files[1].sha256, sha(big))
  assert.equal(files[1].size, 5000)
  assert.equal(result.globalPax.comment, 'a'.repeat(40))
})

test('נתיב ארוך דרך pax', async () => {
  const long = `root/${'d'.repeat(120)}/file.txt`
  const gz = makeTarGz([{ name: 'root/short', content: 'z', pax: { path: long } }])
  const { entries } = await readAll(gz)
  assert.equal(entries[0].path, long)
})

test('דוחה מעבר תיקיות ונתיב מוחלט', async () => {
  for (const name of ['root/../../etc/passwd', '/etc/passwd', 'C:/x', 'root\\..\\x']) {
    const gz = makeTarGz([{ name, content: 'x' }])
    await assert.rejects(readAll(gz), (err) => err instanceof TarError && err.code === 'path_traversal', name)
  }
  assert.equal(normalizeEntryPath('./a//b/./c'), 'a/b/c')
})

test('קישורים והתקנים מדווחים בלי תוכן ובלי כתיבה', async () => {
  const gz = makeTarGz([
    { name: 'root/link', type: '2', linkname: '../../../etc/shadow' },
    { name: 'root/hard', type: '1', linkname: 'root/a' },
    { name: 'root/dev', type: '3' },
    { name: 'root/fifo', type: '6' },
    { name: 'root/after.txt', content: 'ok' },
  ])
  const { entries } = await readAll(gz)
  assert.deepEqual(entries.map((e) => e.type), ['symlink', 'hardlink', 'chardev', 'fifo', 'file'])
  assert.equal(entries[0].linkname, '../../../etc/shadow')
  assert.equal(entries[0].content, undefined)
  assert.equal(entries[4].content.toString(), 'ok')
})

test('מגבלות: מספר רשומות, נפח לא דחוס, וקובץ מעל תקרת החוצץ', async () => {
  const many = makeTarGz(Array.from({ length: 20 }, (_, i) => ({ name: `root/f${i}`, content: 'a' })))
  await assert.rejects(readAll(many, { maxEntries: 10 }), (e) => e.code === 'limit_exceeded')

  const bomb = makeTarGz([{ name: 'root/zeros', content: Buffer.alloc(200_000) }])
  await assert.rejects(readAll(bomb, { maxUncompressedBytes: 100_000 }), (e) => e.code === 'limit_exceeded')

  const { entries } = await readAll(makeTarGz([{ name: 'root/big', content: Buffer.alloc(3000, 0x61) }]), { maxBufferBytes: 1000 })
  assert.equal(entries[0].content, null)
  assert.equal(entries[0].head.length, 3000)
  assert.equal(entries[0].sha256, sha(Buffer.alloc(3000, 0x61)))
})

test('checksum שגוי וקלט שאינו gzip נדחים', async () => {
  await assert.rejects(readAll(makeTarGz([{ name: 'root/a', content: 'x', badChecksum: true }])), (e) => e.code === 'bad_checksum')
  await assert.rejects(readAll(Buffer.from('not a gzip stream at all')), (e) => e instanceof TarError && e.code === 'bad_gzip')
})

test('git blob SHA-1 לכל קובץ רגיל (להשוואה לעץ ה-commit)', async () => {
  const { entries } = await readAll(makeTarGz([{ name: 'root/a.txt', content: 'hello\n' }, { name: 'root/empty', content: '' }]))
  assert.equal(entries[0].gitSha1, gitSha('hello\n'))
  assert.equal(entries[0].gitSha1, 'ce013625030ba8dba906f756967f9e9ca394464a')
  assert.equal(entries[1].gitSha1, 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
})
