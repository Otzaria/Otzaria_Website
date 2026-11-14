import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, readdir, writeFile, utimes, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import {
  reviewFilePath, writeReviewAssetStream, openReviewAssetStream, readReviewAssetBuffer, deleteReviewFiles, sweepTmpFiles,
  AssetExistsError, SizeMismatchError, UploadAbortedError,
} from './storage.js'

let root
let env
const RID = 'abcdefabcdefabcdefabcdef'
const sha = (b) => createHash('sha256').update(b).digest('hex')
const streamOf = (...chunks) => new ReadableStream({
  start(controller) {
    for (const c of chunks) controller.enqueue(new Uint8Array(Buffer.from(c)))
    controller.close()
  },
})

before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'svc-storage-'))
  env = { SERVICE_PLUGIN_STORAGE_DIR: root }
})
after(async () => {
  await rm(root, { recursive: true, force: true })
})

test('נתיבים: רק מזהה ObjectId ומפתח מוכר, בתוך השורש', () => {
  assert.equal(reviewFilePath(RID, 'native3', env), path.join(root, RID, 'native3'))
  for (const bad of ['../../etc', 'ABCDEFABCDEFABCDEFABCDEF', `${RID}/..`, '', null]) {
    assert.throws(() => reviewFilePath(bad, 'plugin', env), /Invalid review id/, String(bad))
  }
  for (const key of ['../plugin', 'native8', 'plugin/../x', '']) assert.throws(() => reviewFilePath(RID, key, env), /Invalid asset key/)
})

test('כתיבה בזרימה: hash וגודל מדויקים, בלי tmp שנשאר', async () => {
  const res = await writeReviewAssetStream(RID, 'plugin', streamOf('hello ', 'world'), { expectedSize: 11, maxBytes: 100 }, env)
  assert.deepEqual(res, { sha256: sha('hello world'), size: 11 })
  assert.equal(await readFile(path.join(root, RID, 'plugin'), 'utf8'), 'hello world')
  assert.deepEqual(await readdir(path.join(root, RID)), ['plugin'])
})

test('אין דריסה של קובץ קיים', async () => {
  await assert.rejects(writeReviewAssetStream(RID, 'plugin', streamOf('other data!'), { expectedSize: 11, maxBytes: 100 }, env), AssetExistsError)
  assert.equal(await readFile(path.join(root, RID, 'plugin'), 'utf8'), 'hello world')
})

test('גודל לא תואם (יותר/פחות) נדחה ולא נשאר קובץ', async () => {
  await assert.rejects(writeReviewAssetStream(RID, 'native0', streamOf('123456'), { expectedSize: 5, maxBytes: 100 }, env), SizeMismatchError)
  await assert.rejects(writeReviewAssetStream(RID, 'native0', streamOf('1234'), { expectedSize: 5, maxBytes: 100 }, env), SizeMismatchError)
  await assert.rejects(writeReviewAssetStream(RID, 'native0', streamOf('1'), { expectedSize: 200, maxBytes: 100 }, env), SizeMismatchError)
  assert.deepEqual(await readdir(path.join(root, RID)), ['plugin'])
})

test('זרם שנקטע → upload_incomplete', async () => {
  let n = 0
  const broken = new ReadableStream({
    pull(controller) {
      if (n++ === 0) controller.enqueue(new Uint8Array([1, 2, 3]))
      else controller.error(new Error('socket hang up'))
    },
  })
  const err = await writeReviewAssetStream(RID, 'native1', broken, { expectedSize: 10, maxBytes: 100 }, env).catch((e) => e)
  assert.ok(err instanceof UploadAbortedError)
  assert.equal(err.code, 'upload_incomplete')
  assert.deepEqual(await readdir(path.join(root, RID)), ['plugin'])
})

test('שתי כתיבות מקבילות לאותו מפתח — אחת בלבד מצליחה', async () => {
  const results = await Promise.allSettled([
    writeReviewAssetStream(RID, 'native2', streamOf('aaaa'), { expectedSize: 4, maxBytes: 100 }, env),
    writeReviewAssetStream(RID, 'native2', streamOf('bbbb'), { expectedSize: 4, maxBytes: 100 }, env),
  ])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.ok(results.find((r) => r.status === 'rejected').reason instanceof AssetExistsError)
})

test('קריאה: זרם וגודל, buffer עם תקרה, null כשחסר', async () => {
  const opened = await openReviewAssetStream(RID, 'plugin', env)
  assert.equal(opened.size, 11)
  assert.equal(Buffer.from(await new Response(opened.stream).arrayBuffer()).toString(), 'hello world')
  assert.equal(await openReviewAssetStream(RID, 'native7', env), null)
  assert.equal((await readReviewAssetBuffer(RID, 'plugin', 100, env)).toString(), 'hello world')
  await assert.rejects(readReviewAssetBuffer(RID, 'plugin', 5, env), SizeMismatchError)
  assert.equal(await readReviewAssetBuffer('bcdefabcdefabcdefabcdefa', 'plugin', 5, env), null)
})

test('מחיקה לפי מפתחות ומחיקת תיקייה', async () => {
  await deleteReviewFiles(RID, { keys: ['native2', 'native5'] }, env)
  assert.deepEqual(await readdir(path.join(root, RID)), ['plugin'])
  await deleteReviewFiles(RID, {}, env)
  await assert.rejects(readdir(path.join(root, RID)), { code: 'ENOENT' })
  await deleteReviewFiles(RID, {}, env)
})

test('ניקוי קובצי tmp ישנים בלבד', async () => {
  const dir = path.join(root, RID)
  await mkdir(dir, { recursive: true })
  const oldTmp = path.join(dir, '.native0.0123456789abcdef.tmp')
  const newTmp = path.join(dir, '.plugin.fedcba9876543210.tmp')
  await writeFile(oldTmp, 'x')
  await writeFile(newTmp, 'x')
  await writeFile(path.join(dir, 'plugin'), 'keep')
  const old = new Date(Date.now() - 2 * 24 * 3600_000)
  await utimes(oldTmp, old, old)
  assert.equal(await sweepTmpFiles(24 * 3600_000, env), 1)
  assert.deepEqual((await readdir(dir)).sort(), ['.plugin.fedcba9876543210.tmp', 'plugin'])
  assert.equal(await sweepTmpFiles(1, { SERVICE_PLUGIN_STORAGE_DIR: path.join(root, 'missing') }), 0)
})
