import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'

const BLOCK = 512
const HEAD_BYTES = 8192

export class TarError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'TarError'
    this.code = code
  }
}

export const DEFAULT_TAR_LIMITS = Object.freeze({
  maxUncompressedBytes: 1024 * 1024 * 1024,
  maxEntries: 200_000,
  maxPathLength: 4096,
  maxPaxBytes: 1024 * 1024,
  maxBufferBytes: 2 * 1024 * 1024,
})

const TYPE_NAMES = {
  '0': 'file', '\0': 'file', '7': 'file', '1': 'hardlink', '2': 'symlink', '3': 'chardev', '4': 'blockdev',
  '5': 'directory', '6': 'fifo',
}

function readString(buf, start, len) {
  const slice = buf.subarray(start, start + len)
  const nul = slice.indexOf(0)
  return (nul === -1 ? slice : slice.subarray(0, nul)).toString('utf8')
}

function readOctal(buf, start, len) {
  if (buf[start] & 0x80) throw new TarError('unsupported_size_encoding')
  const s = readString(buf, start, len).trim()
  if (!s) return 0
  if (!/^[0-7]+$/.test(s)) throw new TarError('bad_header', 'octal')
  return parseInt(s, 8)
}

function verifyChecksum(header) {
  const stored = readOctal(header, 148, 8)
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : header[i]
  if (sum !== stored) throw new TarError('bad_checksum')
}

export function parsePax(buf) {
  const out = {}
  let pos = 0
  while (pos < buf.length) {
    const space = buf.indexOf(0x20, pos)
    if (space === -1) break
    const len = Number(buf.subarray(pos, space).toString('ascii'))
    if (!Number.isInteger(len) || len <= 0 || pos + len > buf.length) throw new TarError('bad_pax')
    const record = buf.subarray(space + 1, pos + len - 1).toString('utf8')
    const eq = record.indexOf('=')
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1)
    pos += len
  }
  return out
}

/**
 * נרמול נתיב מתוך הארכיון. נתיב מוחלט, '..', או NUL — דחייה של כל הארכיון.
 * @returns {string} נתיב יחסי מופרד ב-'/', או '' לשורש
 */
export function normalizeEntryPath(raw) {
  if (raw.includes('\0')) throw new TarError('bad_path', 'nul')
  const unified = raw.replace(/\\/g, '/')
  if (unified.startsWith('/') || /^[A-Za-z]:/.test(unified)) throw new TarError('path_traversal', raw)
  const parts = unified.split('/').filter((p) => p !== '' && p !== '.')
  if (parts.includes('..')) throw new TarError('path_traversal', raw)
  return parts.join('/')
}

/**
 * קורא tar.gz בזרימה. לכל רשומה קורא ל-`onEntry` (await):
 * `{ path, type, size, mode, linkname, sha256?, gitSha1?, head?, content? }` — ל-file: sha256 ו-gitSha1 (git blob) תמיד, head (8KiB ראשונים),
 * content רק כשהגודל ≤ maxBufferBytes. קישורים, התקנים ו-fifo אינם נכתבים — רק מדווחים.
 * @param {AsyncIterable<Uint8Array>} compressed
 */
export async function readTarGz(compressed, { onEntry, limits = {} } = {}) {
  const lim = { ...DEFAULT_TAR_LIMITS, ...limits }
  const gunzip = createGunzip()
  const source = Readable.from(compressed)
  source.on('error', (err) => gunzip.destroy(err))
  source.pipe(gunzip)

  let total = 0
  let buffered = Buffer.alloc(0)
  let state = { kind: 'header' }
  let pending = {} // pax / GNU longname לרשומה הבאה
  let globalPax = {}
  let entries = 0
  let ended = false

  const startEntry = async (header) => {
    verifyChecksum(header)
    const typeflag = String.fromCharCode(header[156])
    const size = readOctal(header, 124, 12)
    if (size > lim.maxUncompressedBytes) throw new TarError('limit_exceeded', 'entry size')
    const magic = readString(header, 257, 6)
    let name = readString(header, 0, 100)
    const prefix = magic.startsWith('ustar') ? readString(header, 345, 155) : ''
    if (prefix && magic === 'ustar') name = `${prefix}/${name}`
    let linkname = readString(header, 157, 100)
    const mode = readOctal(header, 100, 8)

    if (typeflag === 'x' || typeflag === 'g' || typeflag === 'L' || typeflag === 'K') {
      if (size > lim.maxPaxBytes) throw new TarError('limit_exceeded', 'pax header')
      return { kind: 'meta', typeflag, remaining: size, chunks: [], padding: pad(size) }
    }

    if (pending.path !== undefined) name = pending.path
    if (pending.linkpath !== undefined) linkname = pending.linkpath
    const paxSize = pending.size !== undefined ? Number(pending.size) : null
    pending = {}
    const realSize = paxSize !== null && Number.isSafeInteger(paxSize) && paxSize >= 0 ? paxSize : size
    if (realSize > lim.maxUncompressedBytes) throw new TarError('limit_exceeded', 'entry size')
    if (name.length > lim.maxPathLength) throw new TarError('bad_path', 'too long')

    entries++
    if (entries > lim.maxEntries) throw new TarError('limit_exceeded', 'entries')
    const type = TYPE_NAMES[typeflag] ?? 'other'
    const entry = { path: normalizeEntryPath(name), rawType: typeflag, type, size: realSize, mode, linkname }
    // רק לקובץ רגיל יש תוכן שנקרא; לשאר הסוגים דילוג על הבתים (אם יש) בלי לפרש אותם.
    const hasData = type === 'file' || type === 'other'
    const dataSize = hasData ? realSize : 0
    if (type === 'file') {
      return { kind: 'file', entry, remaining: dataSize, padding: pad(dataSize), hash: createHash('sha256'),
        git: createHash('sha1').update(`blob ${dataSize}\0`), head: [], headBytes: 0,
        chunks: realSize <= lim.maxBufferBytes ? [] : null }
    }
    if (dataSize === 0) {
      await onEntry?.(entry)
      return { kind: 'header' }
    }
    return { kind: 'skip', entry, remaining: dataSize, padding: pad(dataSize) }
  }

  const finishMeta = (st) => {
    const data = Buffer.concat(st.chunks)
    if (st.typeflag === 'x') Object.assign(pending, parsePax(data))
    else if (st.typeflag === 'g') globalPax = { ...globalPax, ...parsePax(data) }
    else if (st.typeflag === 'L') pending.path = readString(data, 0, data.length)
    else if (st.typeflag === 'K') pending.linkpath = readString(data, 0, data.length)
  }

  const consume = async () => {
    while (!ended) {
      if (state.kind === 'header') {
        if (buffered.length < BLOCK) return
        const header = buffered.subarray(0, BLOCK)
        buffered = buffered.subarray(BLOCK)
        if (header.every((b) => b === 0)) {
          ended = true
          return
        }
        state = await startEntry(header)
        continue
      }
      if (state.remaining > 0) {
        if (!buffered.length) return
        const take = Math.min(state.remaining, buffered.length)
        const piece = buffered.subarray(0, take)
        buffered = buffered.subarray(take)
        state.remaining -= take
        if (state.kind === 'meta') state.chunks.push(Buffer.from(piece))
        if (state.kind === 'file') {
          state.hash.update(piece)
          state.git.update(piece)
          if (state.headBytes < HEAD_BYTES) {
            const h = piece.subarray(0, HEAD_BYTES - state.headBytes)
            state.head.push(Buffer.from(h))
            state.headBytes += h.length
          }
          if (state.chunks) state.chunks.push(Buffer.from(piece))
        }
        if (state.remaining > 0) return
      }
      if (state.padding > 0) {
        const take = Math.min(state.padding, buffered.length)
        buffered = buffered.subarray(take)
        state.padding -= take
        if (state.padding > 0) return
      }
      const done = state
      state = { kind: 'header' }
      if (done.kind === 'meta') finishMeta(done)
      else if (done.kind === 'file') {
        await onEntry?.({ ...done.entry, sha256: done.hash.digest('hex'), gitSha1: done.git.digest('hex'), head: Buffer.concat(done.head),
          content: done.chunks ? Buffer.concat(done.chunks) : null })
      } else if (done.kind === 'skip') {
        await onEntry?.(done.entry)
      }
    }
  }

  try {
    for await (const chunk of gunzip) {
      total += chunk.length
      if (total > lim.maxUncompressedBytes) throw new TarError('limit_exceeded', 'uncompressed size')
      if (ended) continue
      buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk
      await consume()
    }
  } catch (err) {
    source.destroy()
    gunzip.destroy()
    if (err instanceof TarError) throw err
    if (err?.code?.startsWith?.('Z_') || /incorrect header|unexpected end/i.test(err?.message ?? '')) {
      throw new TarError('bad_gzip', err.message)
    }
    throw err
  }
  if (!ended && (state.kind !== 'header' || buffered.length)) throw new TarError('truncated')
  return { entries, uncompressedBytes: total, globalPax }
}

function pad(size) {
  const r = size % BLOCK
  return r === 0 ? 0 : BLOCK - r
}
