import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
export const sha = (buf) => createHash('sha256').update(buf).digest('hex')
export const gitSha = (buf) => createHash('sha1').update(`blob ${Buffer.from(buf).length}\0`).update(Buffer.from(buf)).digest('hex')
export const fakeBin = (name, ...extra) => ({ bin: process.execPath, args: [path.join(FIXTURES, name), ...extra] })

export async function tempDir(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'broker-test-'))
  t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 5 }))
  return dir
}

export function tarHeader({ name, size = 0, type = '0', linkname = '', mode = 0o644, prefix = '', badChecksum = false }) {
  const b = Buffer.alloc(512)
  b.write(name, 0, 100)
  b.write(mode.toString(8).padStart(7, '0') + '\0', 100)
  b.write('0000000\0', 108)
  b.write('0000000\0', 116)
  b.write(size.toString(8).padStart(11, '0') + '\0', 124)
  b.write('00000000000\0', 136)
  b.fill(0x20, 148, 156)
  b.write(type, 156)
  b.write(linkname, 157, 100)
  b.write('ustar\0', 257)
  b.write('00', 263)
  b.write(prefix, 345, 155)
  let sum = 0
  for (const x of b) sum += x
  if (badChecksum) sum += 1
  b.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
  return b
}

export function paxData(records) {
  const parts = []
  for (const [k, v] of Object.entries(records)) {
    const body = ` ${k}=${v}\n`
    let len = Buffer.byteLength(body) + 1
    while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body)
    parts.push(`${len}${body}`)
  }
  return Buffer.from(parts.join(''))
}

const padTo512 = (buf) => Buffer.concat([buf, Buffer.alloc((512 - (buf.length % 512)) % 512)])

/**
 * @param {Array<{name:string, content?:string|Buffer, type?:string, linkname?:string, pax?:object, badChecksum?:boolean}>} entries
 */
export function makeTar(entries, { globalPax = null, end = true } = {}) {
  const blocks = []
  if (globalPax) {
    const data = paxData(globalPax)
    blocks.push(tarHeader({ name: 'pax_global_header', size: data.length, type: 'g' }), padTo512(data))
  }
  for (const e of entries) {
    if (e.pax) {
      const data = paxData(e.pax)
      blocks.push(tarHeader({ name: 'PaxHeader', size: data.length, type: 'x' }), padTo512(data))
    }
    const content = e.content === undefined ? Buffer.alloc(0) : Buffer.from(e.content)
    const type = e.type ?? '0'
    const size = type === '0' ? content.length : 0
    blocks.push(tarHeader({ name: e.name, size, type, linkname: e.linkname ?? '', badChecksum: e.badChecksum }))
    if (size) blocks.push(padTo512(content))
  }
  if (end) blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

export const makeTarGz = (entries, opts) => gzipSync(makeTar(entries, opts))

/** תגובת git/trees?recursive=1 שתואמת לרשומות של makeTar (בלי תיקיית השורש של הארכיון). */
export function gitTreeFor(entries, { truncated = false, extra = [], drop = [] } = {}) {
  const tree = []
  for (const e of entries) {
    const rel = e.name.split('/').slice(1).join('/').replace(/\/$/, '')
    if (!rel || drop.includes(rel)) continue
    const type = e.type ?? '0'
    if (type === '5') tree.push({ path: rel, mode: '040000', type: 'tree', sha: 'f'.repeat(40) })
    else if (type === '2') tree.push({ path: rel, mode: '120000', type: 'blob', sha: gitSha(e.linkname) })
    else tree.push({ path: rel, mode: '100644', type: 'blob', sha: gitSha(e.content ?? '') })
  }
  return JSON.stringify({ sha: 'e'.repeat(40), truncated, tree: [...tree, ...extra] })
}

export async function* chunked(buf, size = 997) {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size)
}

export function response(body, { status = 200, headers = {} } = {}) {
  return new Response(body, { status, headers })
}
