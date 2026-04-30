import path from 'path'
import { promises as fs } from 'fs'
import crypto from 'crypto'

// מגבלות גודל
export const MAX_PLUGIN_BYTES = 50 * 1024 * 1024 // 50MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024   // 5MB
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
export const MAX_SCREENSHOTS = 10

// סוגי תמונה מותרים (whitelist)
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
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

// קריאת קובץ תוסף מהדיסק
export async function readPluginAsset(pluginId, relativePath) {
  const dir = getPluginDir(pluginId)
  const target = path.resolve(dir, relativePath)
  if (!target.startsWith(dir + path.sep) && target !== dir) {
    throw new Error('Asset path escapes plugin dir')
  }
  return fs.readFile(target)
}

// מחיקת כל הקבצים של תוסף
export async function deletePluginDir(pluginId) {
  const dir = getPluginDir(pluginId)
  await fs.rm(dir, { recursive: true, force: true })
}

export const PLUGIN_FILE_BASENAME = 'plugin'
export const IMAGE_BASENAME = 'image'
