// אחסון קובצי הגשות השירות: <storageDir>/<reviewId>/<key>. קובץ שנקלט לעולם אינו נדרס.
// מחוץ ל-public ול-trace של הבנייה (turbopackIgnore על כל נתיב דינמי).
import path from 'node:path'
import { promises as fsp, createReadStream, constants as fsConstants } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { getServicePluginConfig } from './config.js'
import { ASSET_KEYS } from './policy.js'

class StorageError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.name = this.constructor.name
  }
}
export class AssetExistsError extends StorageError {
  constructor() { super('asset_exists', 'הקובץ כבר הועלה להגשה זו') }
}
export class SizeMismatchError extends StorageError {
  constructor(message = 'גודל הקובץ אינו תואם לגודל שהוצהר') { super('size_mismatch', message) }
}
export class UploadAbortedError extends StorageError {
  constructor() { super('upload_incomplete', 'ההעלאה נקטעה לפני סיומה') }
}
export class StorageUnavailableError extends StorageError {
  constructor(cause) {
    super('storage_unavailable', 'אחסון הקבצים אינו זמין כרגע')
    if (cause) this.cause = cause
  }
}

const UNAVAILABLE_CODES = new Set(['ENOSPC', 'EDQUOT', 'EROFS', 'EACCES', 'EPERM', 'EIO', 'EMFILE', 'ENFILE', 'EBUSY', 'ENOTDIR'])
const toStorageError = (err) => (err instanceof StorageError ? err : UNAVAILABLE_CODES.has(err?.code) ? new StorageUnavailableError(err) : err)

const REVIEW_ID_RE = /^[a-f0-9]{24}$/
const TMP_RE = /^\.[a-z0-9]+\.[a-f0-9]{16}\.tmp$/

export function storageRoot(env = process.env) {
  return path.resolve(/*turbopackIgnore: true*/ getServicePluginConfig(env).storageDir)
}

function reviewDir(reviewId, env) {
  const id = String(reviewId ?? '')
  if (!REVIEW_ID_RE.test(id)) throw new Error('Invalid review id')
  const root = storageRoot(env)
  const dir = path.resolve(/*turbopackIgnore: true*/ root, id)
  if (!dir.startsWith(root + path.sep)) throw new Error('Review dir escapes storage root')
  return dir
}

export function reviewFilePath(reviewId, key, env = process.env) {
  if (!ASSET_KEYS.includes(key)) throw new Error('Invalid asset key')
  const dir = reviewDir(reviewId, env)
  const file = path.resolve(/*turbopackIgnore: true*/ dir, key)
  if (!file.startsWith(dir + path.sep)) throw new Error('Asset path escapes review dir')
  return file
}

async function readChunks(webStream, onChunk) {
  if (!webStream) return
  const reader = webStream.getReader()
  try {
    for (;;) {
      let result
      try {
        result = await reader.read()
      } catch {
        throw new UploadAbortedError()
      }
      if (result.done) return
      await onChunk(result.value)
    }
  } catch (err) {
    reader.cancel().catch(() => {})
    throw err
  } finally {
    try { reader.releaseLock() } catch { /* already released */ }
  }
}

/**
 * כתיבה בזרימה: לקובץ זמני באותה תיקייה (wx, 0o640), hash תוך כדי, אכיפת גודל מדויק, fsync,
 * ואז link ליעד — שנכשל אם היעד קיים, כך שאין דריסה גם במרוץ.
 * @returns {Promise<{sha256:string, size:number}>}
 */
export async function writeReviewAssetStream(reviewId, key, webStream, { expectedSize, maxBytes }, env = process.env) {
  if (!Number.isInteger(expectedSize) || expectedSize < 0 || (Number.isInteger(maxBytes) && expectedSize > maxBytes)) {
    throw new SizeMismatchError('הגודל שהוצהר אינו תקין')
  }
  const finalPath = reviewFilePath(reviewId, key, env)
  const dir = path.dirname(finalPath)
  const tmpPath = path.join(/*turbopackIgnore: true*/ dir, `.${key}.${randomBytes(8).toString('hex')}.tmp`)
  let handle
  try {
    await fsp.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true, mode: 0o750 })
    if (await exists(finalPath)) throw new AssetExistsError()
    handle = await fsp.open(/*turbopackIgnore: true*/ tmpPath, 'wx', 0o640)
    const hash = createHash('sha256')
    let size = 0
    await readChunks(webStream, async (chunk) => {
      size += chunk.byteLength
      if (size > expectedSize) throw new SizeMismatchError()
      hash.update(chunk)
      let offset = 0
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset)
        offset += bytesWritten
      }
    })
    if (size !== expectedSize) throw new SizeMismatchError()
    await handle.sync()
    await handle.close()
    handle = null
    await publishWithoutOverwrite(tmpPath, finalPath)
    return { sha256: hash.digest('hex'), size }
  } catch (err) {
    throw toStorageError(err)
  } finally {
    if (handle) await handle.close().catch(() => {})
    await fsp.rm(/*turbopackIgnore: true*/ tmpPath, { force: true }).catch(() => {})
  }
}

async function publishWithoutOverwrite(tmpPath, finalPath) {
  try {
    await fsp.link(/*turbopackIgnore: true*/ tmpPath, finalPath)
  } catch (err) {
    if (err?.code === 'EEXIST') throw new AssetExistsError()
    if (!['EPERM', 'ENOTSUP', 'ENOSYS', 'EXDEV', 'EMLINK'].includes(err?.code)) throw err
    // מערכת קבצים בלי hard links: העתקה בלעדית (COPYFILE_EXCL) — גם היא לא דורסת.
    try {
      await fsp.copyFile(/*turbopackIgnore: true*/ tmpPath, finalPath, fsConstants.COPYFILE_EXCL)
    } catch (copyErr) {
      if (copyErr?.code === 'EEXIST') throw new AssetExistsError()
      throw copyErr
    }
  }
}

async function exists(file) {
  try {
    await fsp.access(/*turbopackIgnore: true*/ file)
    return true
  } catch (err) {
    if (err?.code === 'ENOENT') return false
    throw err
  }
}

async function statFile(file) {
  try {
    const stat = await fsp.stat(/*turbopackIgnore: true*/ file)
    return stat.isFile() ? stat : null
  } catch (err) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') return null
    throw toStorageError(err)
  }
}

/** @returns {Promise<{stream:ReadableStream, size:number}|null>} */
export async function openReviewAssetStream(reviewId, key, env = process.env) {
  const file = reviewFilePath(reviewId, key, env)
  const stat = await statFile(file)
  if (!stat) return null
  const nodeStream = createReadStream(/*turbopackIgnore: true*/ file)
  return { stream: Readable.toWeb(nodeStream), size: stat.size }
}

export async function readReviewAssetBuffer(reviewId, key, maxBytes, env = process.env) {
  const file = reviewFilePath(reviewId, key, env)
  const stat = await statFile(file)
  if (!stat) return null
  if (Number.isInteger(maxBytes) && stat.size > maxBytes) throw new SizeMismatchError('הקובץ גדול מהמותר')
  try {
    return await fsp.readFile(/*turbopackIgnore: true*/ file)
  } catch (err) {
    throw toStorageError(err)
  }
}

/** keys חסר → כל תיקיית ההגשה. */
export async function deleteReviewFiles(reviewId, { keys } = {}, env = process.env) {
  if (Array.isArray(keys)) {
    for (const key of keys) await fsp.rm(/*turbopackIgnore: true*/ reviewFilePath(reviewId, key, env), { force: true })
    return
  }
  await fsp.rm(/*turbopackIgnore: true*/ reviewDir(reviewId, env), { recursive: true, force: true })
}

/** מחיקת קובצי tmp שנשארו מהעלאות שנקטעו בתהליך שמת. */
export async function sweepTmpFiles(olderThanMs, env = process.env, now = Date.now()) {
  const root = storageRoot(env)
  let entries
  try {
    entries = await fsp.readdir(/*turbopackIgnore: true*/ root, { withFileTypes: true })
  } catch (err) {
    if (err?.code === 'ENOENT') return 0
    throw err
  }
  let removed = 0
  for (const entry of entries) {
    if (!entry.isDirectory() || !REVIEW_ID_RE.test(entry.name)) continue
    const dir = path.join(/*turbopackIgnore: true*/ root, entry.name)
    let files
    try {
      files = await fsp.readdir(/*turbopackIgnore: true*/ dir)
    } catch {
      continue
    }
    for (const name of files) {
      if (!TMP_RE.test(name)) continue
      const file = path.join(/*turbopackIgnore: true*/ dir, name)
      try {
        const stat = await fsp.stat(/*turbopackIgnore: true*/ file)
        if (now - stat.mtimeMs >= olderThanMs) {
          await fsp.rm(/*turbopackIgnore: true*/ file, { force: true })
          removed++
        }
      } catch { /* נמחק במקביל */ }
    }
  }
  return removed
}
