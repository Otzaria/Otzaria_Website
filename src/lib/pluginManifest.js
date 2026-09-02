import { inflateRawSync } from 'zlib'
import { compareVersions } from './semverCompare.js'

export { compareVersions }

/**
 * Reads the ZIP central directory of an .otzplugin Buffer and returns one record
 * per entry. Reading the central directory (rather than the local headers) means
 * this works even with data-descriptor ZIPs, and it inflates nothing at all.
 */
function readCentralDirectory(buffer) {
  // Find EOCD (End of Central Directory) by searching backwards
  let eocdOffset = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file')

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16)
  const cdEntries = buffer.readUInt16LE(eocdOffset + 10)

  const entries = []
  let cdPos = cdOffset
  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(cdPos) !== 0x02014b50) break
    const compressionMethod = buffer.readUInt16LE(cdPos + 10)
    const compressedSize = buffer.readUInt32LE(cdPos + 20)
    const uncompressedSize = buffer.readUInt32LE(cdPos + 24)
    const fileNameLength = buffer.readUInt16LE(cdPos + 28)
    const extraFieldLength = buffer.readUInt16LE(cdPos + 30)
    const commentLength = buffer.readUInt16LE(cdPos + 32)
    const localHeaderOffset = buffer.readUInt32LE(cdPos + 42)
    const fileName = buffer.toString('utf8', cdPos + 46, cdPos + 46 + fileNameLength)
    cdPos += 46 + fileNameLength + extraFieldLength + commentLength

    entries.push({ fileName, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset })
  }
  return entries
}

/**
 * שמות הקבצים שבחבילת התוסף וגודלם, מתוך ה-central directory בלבד — בלי לפרוס
 * אף רשומה. משמש למדיניות החנות: זיהוי קובץ הרצה שנארז בתוך ה-.otzplugin
 * (ראו src/lib/pluginCompanion.js).
 */
export function listPluginEntries(buffer) {
  return readCentralDirectory(buffer)
    .filter((entry) => !entry.fileName.endsWith('/'))
    .map((entry) => ({ name: entry.fileName, size: entry.uncompressedSize }))
}

/**
 * Reads and parses manifest.json from an .otzplugin (ZIP) Buffer.
 * Uses the central directory so it works even with data-descriptor ZIPs.
 * Throws if manifest.json is not found or cannot be parsed.
 */
export function readManifestFromPlugin(buffer) {
  for (const { fileName, compressionMethod, compressedSize, localHeaderOffset } of readCentralDirectory(buffer)) {
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

// compareVersions מיוצא מחדש מ-./semverCompare.js (ראו ייבוא למעלה) — כאן
// נשארה רק קריאת ה-ZIP, כדי שהשוואת הגרסאות תהיה זהה גם ללקוח (דף העלאת
// תוסף) וגם לשרת, בלי לשכפל את הלוגיקה.
