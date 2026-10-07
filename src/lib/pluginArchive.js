import { inflateRawSync, crc32 } from 'node:zlib'
import {
  MAX_PLUGIN_BYTES, MAX_PLUGIN_ENTRIES, MAX_PLUGIN_EXPANDED_BYTES,
  MAX_PLUGIN_ENTRY_BYTES, MAX_PLUGIN_CODE_BYTES, MAX_PLUGIN_MANIFEST_BYTES,
} from './pluginLimits.js'

function invalid(message) {
  throw new Error(`Not a valid plugin ZIP: ${message}`)
}

// Read only metadata first. Never trust a ZIP's advertised lengths when inflating:
// inflateRawSync also enforces maxOutputLength and we check the actual length.
export function readPluginZipDirectory(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  if (buffer.length > MAX_PLUGIN_BYTES) invalid('compressed size limit exceeded')
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) {
      end = i
      break
    }
  }
  if (end < 0) invalid('missing end of central directory')
  const count = buffer.readUInt16LE(end + 10)
  if (buffer.readUInt16LE(end + 4) || buffer.readUInt16LE(end + 6) || buffer.readUInt16LE(end + 8) !== count) {
    invalid('multi-volume archives are unsupported')
  }
  if (count > MAX_PLUGIN_ENTRIES) invalid('too many entries')
  const start = buffer.readUInt32LE(end + 16)
  const size = buffer.readUInt32LE(end + 12)
  if (start + size !== end) invalid('invalid central directory bounds (ZIP64 is unsupported)')
  const entries = new Map()
  let pos = start
  let expanded = 0
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || buffer.readUInt32LE(pos) !== 0x02014b50) invalid('invalid directory entry')
    const flags = buffer.readUInt16LE(pos + 8)
    const method = buffer.readUInt16LE(pos + 10)
    const compressed = buffer.readUInt32LE(pos + 20)
    const original = buffer.readUInt32LE(pos + 24)
    const checksum = buffer.readUInt32LE(pos + 16)
    const nameLength = buffer.readUInt16LE(pos + 28)
    const extraLength = buffer.readUInt16LE(pos + 30)
    const commentLength = buffer.readUInt16LE(pos + 32)
    const local = buffer.readUInt32LE(pos + 42)
    const next = pos + 46 + nameLength + extraLength + commentLength
    if (next > end || buffer.readUInt16LE(pos + 34)) invalid('invalid entry bounds')
    const nameBytes = buffer.subarray(pos + 46, pos + 46 + nameLength)
    const name = nameBytes.toString('utf8')
    if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) {
      invalid('invalid entry name')
    }
    if (entries.has(name)) invalid('duplicate entry name')
    if (flags & 1 || ![0, 8].includes(method)) invalid('encrypted or unsupported entry')
    const limit = name === 'manifest.json' ? MAX_PLUGIN_MANIFEST_BYTES
      : /\.(?:js|mjs|cjs|html?|vue|svelte|css)$/i.test(name) ? MAX_PLUGIN_CODE_BYTES : MAX_PLUGIN_ENTRY_BYTES
    expanded += original
    if (original > limit || expanded > MAX_PLUGIN_EXPANDED_BYTES) invalid('expanded size limit exceeded')
    if (local + 30 > start || buffer.readUInt32LE(local) !== 0x04034b50) invalid('invalid local header')
    const localNameLength = buffer.readUInt16LE(local + 26)
    const localExtraLength = buffer.readUInt16LE(local + 28)
    const dataStart = local + 30 + localNameLength + localExtraLength
    if (dataStart + compressed > start || buffer.readUInt16LE(local + 8) !== method ||
        buffer.readUInt16LE(local + 6) !== flags ||
        !buffer.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes)) {
      invalid('inconsistent local header')
    }
    if (method === 0 && compressed !== original) invalid('invalid stored size')
    if (!(flags & 8) && (buffer.readUInt32LE(local + 14) !== checksum ||
        buffer.readUInt32LE(local + 18) !== compressed || buffer.readUInt32LE(local + 22) !== original)) {
      invalid('inconsistent local sizes or checksum')
    }
    if (name.endsWith('/') && original !== 0) invalid('nonempty directory')
    entries.set(name, { name, method, compressed, original, dataStart, checksum })
    pos = next
  }
  if (pos !== end) invalid('central directory size mismatch')
  return { buffer, entries }
}

function inflateEntry({ buffer }, entry) {
  const compressed = buffer.subarray(entry.dataStart, entry.dataStart + entry.compressed)
  const data = entry.method === 0 ? compressed
    : inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.original) })
  if (data.length !== entry.original) invalid('uncompressed size mismatch')
  if (crc32(data) !== entry.checksum) invalid('CRC32 mismatch')
  return data
}

export function extractZipFiles(input, predicate, directory = readPluginZipDirectory(input)) {
  const files = new Map()
  for (const entry of directory.entries.values()) {
    if (!entry.name.endsWith('/') && (!predicate || predicate(entry.name))) {
      files.set(entry.name, inflateEntry(directory, entry))
    }
  }
  return files
}

export function parsePluginManifest(data) {
  const manifest = JSON.parse(data.toString('utf8').replace(/^\uFEFF/, ''))
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest.json must be a JSON object')
  }
  return manifest
}

export function readPluginManifest(input) {
  const directory = readPluginZipDirectory(input)
  const entry = directory.entries.get('manifest.json')
  if (!entry) throw new Error('manifest.json not found in plugin file')
  return parsePluginManifest(inflateEntry(directory, entry))
}
