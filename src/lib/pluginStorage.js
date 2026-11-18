// Uploads/storage are supplied by the live installation, not bundled build assets.
import path from 'path'
import { promises as fs } from 'fs'
import crypto from 'crypto'
import { MAX_PLUGIN_BYTES, MAX_IMAGE_BYTES, MAX_SCREENSHOT_BYTES, MAX_SCREENSHOTS, ALLOWED_IMAGE_MIMES } from './pluginLimits.js'

export { MAX_PLUGIN_BYTES, MAX_IMAGE_BYTES, MAX_SCREENSHOT_BYTES, MAX_SCREENSHOTS }

const OPT_CACHE_BASENAME = 'image_opt.webp'

// דחיסת תמונה ל-WebP עם resize. מדלגת על GIF מונפש.
export async function optimizeImageBuffer(buffer, { maxWidth = 1200, quality = 82 } = {}) {
  const sharp = (await import('sharp')).default
  return sharp(buffer, { animated: false })
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
}

// מחזיר את הנתיב לקובץ ה-cache
export function getOptCachePath(pluginId) {
  return path.join(getPluginDir(pluginId), OPT_CACHE_BASENAME)
}

// מוחק את ה-cache של תמונה מותאמת (לקריאה אחרי עדכון תמונה)
export async function clearImageOptCache(pluginId) {
  try {
    await fs.rm(getOptCachePath(pluginId), { force: true })
  } catch { /* ignore */ }
}

// תמונות ממוזערות לכרטיסים: scripts/backfill-plugin-card-thumbnails.mjs משלים אותן ידנית
// לתוספים קיימים. חובה להריץ אותו עם אותו PLUGIN_STORAGE_DIR של השרת, ולהריץ מחדש אחרי
// העתקה/שחזור של האחסון — שם הקובץ תלוי ב-inode וב-mtime של המקור, והעתקה משנה אותם.
// הגרסה הממוזערת שייכת לקובץ מסוים. החלפה אטומית של המקור יוצרת שם חדש
// גם אם סקריפט ההשלמה קרא את הגרסה הקודמת במקביל.
function cardThumbnailPath(file, stat) {
  return path.join(path.dirname(file), `image_card-${stat.ino}-${stat.size}-${stat.mtimeNs}.webp`)
}

async function writeCardThumbnail(target, source) {
  const sharp = (await import('sharp')).default
  const thumbnail = await sharp(source, { animated: false, limitInputPixels: 16_000_000 })
    .resize({ width: 144, height: 144, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()
  await writeAssetAtomically(target, thumbnail)
}

async function writeAssetAtomically(target, buffer, trackIdentity = false) {
  const tmp = `${target}.${crypto.randomBytes(6).toString('hex')}.tmp`
  try {
    await fs.writeFile(tmp, buffer, { mode: 0o640 })
    const stat = trackIdentity ? await fs.stat(tmp, { bigint: true }) : undefined
    await fs.rename(tmp, target)
    return stat
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {})
    throw error
  }
}

// קריאה בלבד בזמן בקשה; ל-GET אין מסלול שמייצר תמונה בזמן אמת.
export async function readPluginCardThumbnail(pluginId, ext, options) {
  const source = pluginAssetPath(pluginId, `${IMAGE_BASENAME}${ext}`, options)
  const stat = await fs.stat(source, { bigint: true })
  return fs.readFile(cardThumbnailPath(source, stat))
}

export async function promotePendingPluginImage(pluginId, ext) {
  const source = pluginAssetPath(pluginId, `${IMAGE_BASENAME}${ext}`, { pending: true })
  const target = pluginAssetPath(pluginId, `${IMAGE_BASENAME}${ext}`)
  const stat = await fs.stat(source, { bigint: true })
  // המקור הוא הקובץ הקובע. כשהממוזער חסר, ההגשה נופלת לגרסה הרגילה.
  await fs.rename(source, target)
  await fs.rename(cardThumbnailPath(source, stat), cardThumbnailPath(target, stat)).catch((error) => {
    if (error.code !== 'ENOENT') console.warn('Could not move plugin thumbnail:', error.message)
  })
}

export async function backfillPluginCardThumbnail(pluginId, ext) {
  const source = pluginAssetPath(pluginId, `${IMAGE_BASENAME}${ext}`)
  const handle = await fs.open(source, 'r')
  try {
    const stat = await handle.stat({ bigint: true })
    if (!stat.isFile() || stat.size > BigInt(MAX_IMAGE_BYTES)) return false
    const target = cardThumbnailPath(source, stat)
    try {
      await fs.access(target)
      return false
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await writeCardThumbnail(target, await handle.readFile())
    return true
  } finally {
    await handle.close()
  }
}

// שומר תמונה לדיסק תוך דחיסה ל-WebP (חוץ מ-GIF). מחזיר את ה-meta שנשמר.
// destDir: תיקיית היעד, basename: שם הקובץ ללא סיומת, file: File מ-FormData
export async function saveOptimizedImage(file, destDir, basename, { maxWidth = 1200, quality = 82 } = {}) {
  const rawBuf = Buffer.from(await file.arrayBuffer())
  const mime = (file.type || '').toLowerCase()
  let saveBuf = rawBuf
  let ext = imageExtFromMime(mime) || '.bin'
  let contentType = mime

  if (mime !== 'image/gif') {
    try {
      saveBuf = await optimizeImageBuffer(rawBuf, { maxWidth, quality })
      ext = '.webp'
      contentType = 'image/webp'
    } catch { /* fallback to original */ }
  }

  const dest = path.join(/*turbopackIgnore: true*/ destDir, `${basename}${ext}`)
  const identity = await writeAssetAtomically(dest, saveBuf, basename === IMAGE_BASENAME)
  if (identity) {
    try {
      await writeCardThumbnail(cardThumbnailPath(dest, identity), saveBuf)
    } catch (error) {
      console.warn('Could not create plugin thumbnail:', error.message)
    }
  }
  return { ext, contentType }
}

// מגבלות הגודל/כמות עצמן מגיעות מ-./pluginLimits.js (ראו ייבוא וייצוא-מחדש
// למעלה), כדי שדף העלאת התוסף בלקוח ישתמש באותם ערכים בדיוק.

// סוגי תמונה מותרים (whitelist)
const ALLOWED_IMAGE_MIME = new Set(ALLOWED_IMAGE_MIMES)
const MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif'
}

export function isAllowedImage(mime) {
  return typeof mime === 'string' && ALLOWED_IMAGE_MIME.has(mime.toLowerCase())
}

export function imageExtFromMime(mime) {
  return MIME_TO_EXT[(mime || '').toLowerCase()] || null
}

// תיקיית אחסון בסיס - ניתנת להגדרה דרך משתנה סביבה
function getStorageRoot() {
  const root = process.env.PLUGIN_STORAGE_DIR
    ? path.resolve(process.env.PLUGIN_STORAGE_DIR)
    : path.resolve(process.cwd(), 'storage', 'plugins')
  return root
}

// ולידציה שה-id מורכב מתווים בטוחים בלבד (hex של ObjectId)
function assertSafeId(pluginId) {
  if (typeof pluginId !== 'string' || !/^[a-f0-9]{24}$/i.test(pluginId)) {
    throw new Error('Invalid plugin id')
  }
}

// קבלת תיקיית התוסף תוך וידוא שהיא תחת השורש (הגנה מ-path traversal)
export function getPluginDir(pluginId) {
  assertSafeId(pluginId)
  const root = getStorageRoot()
  const dir = path.join(root, pluginId)
  const resolved = path.resolve(dir)
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error('Resolved plugin dir escapes storage root')
  }
  return resolved
}

export async function ensurePluginDir(pluginId) {
  const dir = getPluginDir(pluginId)
  await fs.mkdir(dir, { recursive: true })
  await fs.mkdir(path.join(dir, 'screenshots'), { recursive: true })
  return dir
}

// ולידציה שמחרוזת הגרסה בטוחה לשימוש כשם תיקייה (ללא traversal/תווים מסוכנים).
// תואם ל-PLUGIN_VERSION_RE (ספרות, נקודות, מקף, פלוס, אותיות) — תווים בטוחים בכל מערכת קבצים.
export function assertSafeVersion(version) {
  if (typeof version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.+-]{0,39}$/.test(version) || version.includes('..')) {
    throw new Error('Invalid plugin version segment')
  }
}

// תיקיית האחסון של גרסה ארכיונית ספציפית, תחת תיקיית התוסף (מוגן מ-path traversal).
export function getVersionDir(pluginId, version) {
  assertSafeVersion(version)
  const base = getPluginDir(pluginId)
  const dir = path.join(base, VERSIONS_DIRNAME, version)
  const resolved = path.resolve(dir)
  if (!resolved.startsWith(base + path.sep)) {
    throw new Error('Resolved version dir escapes plugin dir')
  }
  return resolved
}

export async function ensureVersionDir(pluginId, version) {
  const dir = getVersionDir(pluginId, version)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

// קריאת קובץ של גרסה ארכיונית
function versionAssetPath(pluginId, version, fileName) {
  const dir = getVersionDir(pluginId, version)
  const target = path.resolve(dir, fileName)
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    throw new Error('Asset path escapes version dir')
  }
  return target
}

export async function readVersionAsset(pluginId, version, fileName) {
  return fs.readFile(versionAssetPath(pluginId, version, fileName))
}

export function openVersionAsset(pluginId, version, fileName) {
  return openDownloadAsset(versionAssetPath(pluginId, version, fileName))
}

// מחיקת תיקיית גרסה ארכיונית שלמה
export async function deleteVersionDir(pluginId, version) {
  const dir = getVersionDir(pluginId, version)
  await fs.rm(dir, { recursive: true, force: true })
}

export function getPendingPluginDir(pluginId) {
  return path.join(getPluginDir(pluginId), PENDING_DIRNAME)
}

export async function ensurePendingPluginDir(pluginId) {
  const dir = getPendingPluginDir(pluginId)
  await fs.mkdir(dir, { recursive: true })
  await fs.mkdir(path.join(dir, 'screenshots'), { recursive: true })
  return dir
}

// שמירת stream/buffer מקובץ FormData תוך אכיפת גודל מקסימלי
export async function saveFileFromFormData(file, destPath, maxBytes) {
  if (file.size > maxBytes) {
    throw new Error(`File exceeds max size of ${maxBytes} bytes`)
  }
  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length > maxBytes) {
    throw new Error(`File exceeds max size of ${maxBytes} bytes`)
  }
  // כתיבה אטומית: כתיבה לקובץ זמני ואז rename
  const tmp = `${destPath}.${crypto.randomBytes(6).toString('hex')}.tmp`
  await fs.writeFile(tmp, buf, { mode: 0o640 })
  await fs.rename(tmp, destPath)
  return buf.length
}

/** SHA-256 של קובץ תוסף כ-hex קטן — השדה sha256 ב-API. */
export function pluginFileSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function pluginAssetPath(pluginId, relativePath, options = {}) {
  const dir = options.pending ? getPendingPluginDir(pluginId) : getPluginDir(pluginId)
  const target = path.resolve(dir, relativePath)
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    throw new Error('Asset path escapes plugin dir')
  }
  return target
}

// קריאת קובץ תוסף מהדיסק
export async function readPluginAsset(pluginId, relativePath, options) {
  return fs.readFile(pluginAssetPath(pluginId, relativePath, options))
}

export function openPluginAsset(pluginId, relativePath, options) {
  return openDownloadAsset(pluginAssetPath(pluginId, relativePath, options))
}

async function openDownloadAsset(target) {
  const handle = await fs.open(target, 'r')
  try {
    const stat = await handle.stat({ bigint: true })
    if (!stat.isFile()) throw Object.assign(new Error('Asset is not a file'), { code: 'ENOENT' })
    const size = Number(stat.size)
    // הקבצים מתחלפים ב-rename ולא נכתבים במקום. הוולידטור מזהה את
    // הקובץ שנפתח בפועל, גם בזמן עדכון הרשומה הנפרדת במסד.
    const etag = `"${stat.dev}-${stat.ino}-${stat.size}-${stat.mtimeNs}-${stat.ctimeNs}"`
    return {
      handle,
      size,
      etag,
      async sha256() {
        const hash = crypto.createHash('sha256')
        for await (const chunk of handle.createReadStream({ start: 0, autoClose: false })) hash.update(chunk)
        return hash.digest('hex')
      },
    }
  } catch (error) {
    await handle.close().catch(() => {})
    throw error
  }
}

export async function removePluginAsset(pluginId, relativePath, options) {
  const target = pluginAssetPath(pluginId, relativePath, options)
  if (Object.values(MIME_TO_EXT).some((ext) => relativePath === IMAGE_BASENAME + ext)) {
    try {
      const stat = await fs.stat(target, { bigint: true })
      await fs.rm(cardThumbnailPath(target, stat), { force: true })
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Could not remove plugin thumbnail:', error.message)
    }
  }
  await fs.rm(target, { force: true, recursive: false })
}

// מחיקת כל הקבצים של תוסף
export async function deletePluginDir(pluginId) {
  const dir = getPluginDir(pluginId)
  await fs.rm(dir, { recursive: true, force: true })
}

export async function deletePendingPluginDir(pluginId) {
  const dir = getPendingPluginDir(pluginId)
  await fs.rm(dir, { recursive: true, force: true })
}

export const PLUGIN_FILE_BASENAME = 'plugin'
export const IMAGE_BASENAME = 'image'
export const PENDING_DIRNAME = 'pending'
export const VERSIONS_DIRNAME = 'versions'
