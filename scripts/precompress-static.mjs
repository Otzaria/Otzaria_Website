import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const MANIFEST = 'manifest.json'
const COMPRESSIBLE_CHUNK = /^[A-Za-z0-9._~-]+\.(css|js)$/
const SHA256 = /^[a-f0-9]{64}$/
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function prepare(chunks, artifact) {
  await mkdir(artifact, { recursive: true })
  const entries = []
  for (const entry of await readdir(chunks, { withFileTypes: true })) {
    if (!entry.isFile() || !COMPRESSIBLE_CHUNK.test(entry.name)) continue
    const bytes = await readFile(path.join(chunks, entry.name))
    if (bytes.length < 2_048) continue
    const gzipBytes = gzipSync(bytes).length
    const compressed = brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })
    if (compressed.length >= gzipBytes) continue
    await writeFile(path.join(artifact, entry.name + '.br'), compressed)
    entries.push({ name: entry.name, sha256: digest(bytes), compressedSha256: digest(compressed),
      gzipBytes, brotliBytes: compressed.length })
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  await writeFile(path.join(artifact, MANIFEST), JSON.stringify(entries, null, 2) + '\n')
  const saved = entries.reduce((sum, entry) => sum + entry.gzipBytes - entry.brotliBytes, 0)
  console.log(`Brotli: ${entries.length} נכסים, ${saved} בתים פחות לעומת gzip`)
}

async function install(chunks, artifact) {
  const entries = JSON.parse(await readFile(path.join(artifact, MANIFEST), 'utf8'))
  let matched = 0
  for (const { name, sha256, compressedSha256 } of entries) {
    if (!COMPRESSIBLE_CHUNK.test(name) || !SHA256.test(sha256) || !SHA256.test(compressedSha256)) {
      throw new Error('רשומת Brotli לא תקינה')
    }
    let original
    try {
      original = await readFile(path.join(chunks, name))
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    // רק קבצים שבניית ה-VPS יצרה עם תוכן זהה לבניית ה-CI מקבלים עותק דחוס.
    if (digest(original) !== sha256) continue
    const nameBr = name + '.br'
    const compressed = await readFile(path.join(artifact, nameBr))
    if (digest(compressed) !== compressedSha256) continue
    await writeFile(path.join(chunks, nameBr), compressed, { flag: 'wx' })
    matched++
  }
  console.log(`Brotli: ${matched} מתוך ${entries.length} נכסים תואמים הועתקו לשחרור`)
}

const [action, chunks, artifact] = process.argv.slice(2)
if (!chunks || !artifact || !['prepare', 'install'].includes(action)) {
  throw new Error('node scripts/precompress-static.mjs <prepare|install> <chunks-directory> <artifact-directory>')
}
await (action === 'prepare' ? prepare : install)(chunks, artifact)
