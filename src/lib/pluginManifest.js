import { inflateRawSync } from 'zlib'

/**
 * Reads and parses manifest.json from an .otzplugin (ZIP) Buffer.
 * Uses the central directory so it works even with data-descriptor ZIPs.
 * Throws if manifest.json is not found or cannot be parsed.
 */
export function readManifestFromPlugin(buffer) {
  // Find EOCD (End of Central Directory) by searching backwards
  let eocdOffset = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file')

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16)
  const cdEntries = buffer.readUInt16LE(eocdOffset + 10)

  // Scan central directory for manifest.json
  let cdPos = cdOffset
  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(cdPos) !== 0x02014b50) break
    const compressionMethod = buffer.readUInt16LE(cdPos + 10)
    const compressedSize = buffer.readUInt32LE(cdPos + 20)
    const fileNameLength = buffer.readUInt16LE(cdPos + 28)
    const extraFieldLength = buffer.readUInt16LE(cdPos + 30)
    const commentLength = buffer.readUInt16LE(cdPos + 32)
    const localHeaderOffset = buffer.readUInt32LE(cdPos + 42)
    const fileName = buffer.toString('utf8', cdPos + 46, cdPos + 46 + fileNameLength)
    cdPos += 46 + fileNameLength + extraFieldLength + commentLength

    if (fileName !== 'manifest.json') continue

    // Use local file header to find actual data offset
    const localFnLen = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localFnLen + localExtraLen
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize)

    let data
    if (compressionMethod === 0) {
      data = compressedData
    } else if (compressionMethod === 8) {
      data = inflateRawSync(compressedData)
    } else {
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`)
    }
    // הסרת UTF-8 BOM אם קיים — עורכים בווינדוז (Notepad, VS Code עם הגדרה ברירת מחדל)
    // שומרים לעיתים JSON עם BOM ש-JSON.parse נופל עליו.
    return JSON.parse(data.toString('utf8').replace(/^\uFEFF/, ''))
  }

  throw new Error('manifest.json not found in plugin file')
}

function parseVersion(version) {
  const normalized = (version || '').trim()
  const withoutBuild = normalized.split('+')[0]
  const dashIndex = withoutBuild.indexOf('-')
  const corePart = dashIndex === -1 ? withoutBuild : withoutBuild.slice(0, dashIndex)
  const prereleasePart = dashIndex === -1 ? '' : withoutBuild.slice(dashIndex + 1)

  return {
    core: corePart.split('.').map((segment) => Number(segment)),
    prerelease: prereleasePart ? prereleasePart.split('.') : []
  }
}

function comparePrereleaseIdentifiers(a, b) {
  const aIsNumeric = /^\d+$/.test(a)
  const bIsNumeric = /^\d+$/.test(b)

  if (aIsNumeric && bIsNumeric) {
    const aNum = Number(a)
    const bNum = Number(b)
    if (aNum !== bNum) return aNum > bNum ? 1 : -1
    return 0
  }

  if (aIsNumeric !== bIsNumeric) {
    return aIsNumeric ? -1 : 1
  }

  if (a === b) return 0
  return a > b ? 1 : -1
}

/**
 * Compares two version strings (e.g. "1.0", "1.2.3", "1.0.0-beta").
 * Returns 1 if a > b, -1 if a < b, 0 if equal, including prerelease precedence.
 */
export function compareVersions(a, b) {
  const parsedA = parseVersion(a)
  const parsedB = parseVersion(b)
  const coreLength = Math.max(parsedA.core.length, parsedB.core.length)

  for (let i = 0; i < coreLength; i++) {
    const partA = parsedA.core[i] ?? 0
    const partB = parsedB.core[i] ?? 0
    if (partA !== partB) return partA > partB ? 1 : -1
  }

  const aHasPrerelease = parsedA.prerelease.length > 0
  const bHasPrerelease = parsedB.prerelease.length > 0

  if (!aHasPrerelease && !bHasPrerelease) return 0
  if (!aHasPrerelease) return 1
  if (!bHasPrerelease) return -1

  const prereleaseLength = Math.max(parsedA.prerelease.length, parsedB.prerelease.length)
  for (let i = 0; i < prereleaseLength; i++) {
    const identifierA = parsedA.prerelease[i]
    const identifierB = parsedB.prerelease[i]

    if (identifierA === undefined) return -1
    if (identifierB === undefined) return 1

    const result = comparePrereleaseIdentifiers(identifierA, identifierB)
    if (result !== 0) return result
  }

  return 0
}
