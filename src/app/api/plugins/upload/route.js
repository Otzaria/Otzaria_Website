import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import path from 'path'
import crypto from 'crypto'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { sendPluginUploadNotification } from '@/lib/emailService'
import {
  MAX_PLUGIN_BYTES,
  MAX_IMAGE_BYTES,
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOTS,
  isAllowedImage,
  imageExtFromMime,
  ensurePluginDir,
  saveFileFromFormData,
  deletePluginDir,
  PLUGIN_FILE_BASENAME,
  IMAGE_BASENAME
} from '@/lib/pluginStorage'

const PLUGIN_FILE_EXT = '.otzplugin'

// מגבלות אורך לשדות טקסט - אכיפה בשרת (אפילו אם הלקוח עוקף).
const LIMITS = {
  name: 100,
  shortDescription: 150,
  description: 10_000,
  version: 30,
  author: 100,
  compatibleWith: 100,
  homepage: 500,
  tag: 40,
  instruction: 500
}

const ALLOWED_STATUSES = ['stable', 'beta', 'experimental']
const VERSION_RE = /^\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.]+)?$/
// slug באנגלית בלבד - אותיות קטנות, ספרות ומקפים. לא מתחיל/מסתיים במקף.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function createSlug(name) {
  const base = name
    .toLowerCase()
    // רק תווים אנגליים, ספרות, רווחים ומקפים. עברית/יוניקוד מוסרים בכוונה.
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim()
  // אם הסינון פירק את השם (למשל שם בעברית בלבד) - מחרוזת רנדומלית באנגלית.
  return base || `plugin-${crypto.randomBytes(4).toString('hex')}`
}

function isHttpUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request) {
  let createdPluginId = null
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return bad('Unauthorized - Please login', 401)
    }

    const formData = await request.formData()

    const name = (formData.get('name') || '').toString().trim()
    const shortDescription = (formData.get('shortDescription') || '').toString().trim()
    const description = (formData.get('description') || '').toString()
    const version = (formData.get('version') || '').toString().trim()
    const statusVal = (formData.get('status') || 'stable').toString()
    const author = (formData.get('author') || '').toString().trim()
    const compatibleWith = (formData.get('compatibleWith') || '').toString().trim()
    const homepage = (formData.get('homepage') || '').toString().trim()

    let tags = []
    try {
      const raw = formData.get('tags')
      if (raw) tags = JSON.parse(raw)
      if (!Array.isArray(tags)) tags = []
      tags = tags.map(t => String(t).trim()).filter(Boolean)
      if (tags.some(t => t.length > LIMITS.tag)) {
        return bad(`Each tag must be at most ${LIMITS.tag} characters`)
      }
      tags = tags.slice(0, 30)
    } catch {
      return bad('Invalid tags format')
    }

    let installInstructions = []
    try {
      const raw = formData.get('installInstructions')
      if (raw) installInstructions = JSON.parse(raw)
      if (!Array.isArray(installInstructions)) installInstructions = []
      installInstructions = installInstructions
        .map(i => String(i))
        .filter(i => i.trim().length > 0)
      if (installInstructions.some(i => i.length > LIMITS.instruction)) {
        return bad(`Each instruction must be at most ${LIMITS.instruction} characters`)
      }
      installInstructions = installInstructions.slice(0, 50)
    } catch {
      return bad('Invalid installInstructions format')
    }

    if (!ALLOWED_STATUSES.includes(statusVal)) {
      return bad(`Status must be one of: ${ALLOWED_STATUSES.join(', ')}`)
    }

    const pluginFile = formData.get('pluginFile')
    const imageFile = formData.get('imageFile')
    const screenshotFiles = formData.getAll('screenshots').filter(f => f && f.size > 0)

    if (!name || !shortDescription || !description || !version || !author || !compatibleWith || !pluginFile) {
      return bad('Missing required fields')
    }

    // אורכים מקסימליים - אכיפה בשרת גם אם הלקוח עוקף.
    if (name.length > LIMITS.name) return bad(`Name must be at most ${LIMITS.name} characters`)
    if (shortDescription.length > LIMITS.shortDescription) return bad(`Short description must be at most ${LIMITS.shortDescription} characters`)
    if (description.length > LIMITS.description) return bad(`Description must be at most ${LIMITS.description} characters`)
    if (version.length > LIMITS.version) return bad(`Version must be at most ${LIMITS.version} characters`)
    if (author.length > LIMITS.author) return bad(`Author must be at most ${LIMITS.author} characters`)
    if (compatibleWith.length > LIMITS.compatibleWith) return bad(`Compatibility must be at most ${LIMITS.compatibleWith} characters`)
    if (homepage.length > LIMITS.homepage) return bad(`Homepage URL must be at most ${LIMITS.homepage} characters`)

    if (!VERSION_RE.test(version)) {
      return bad('Version must be in the form X, X.Y, X.Y.Z (optionally with -beta etc.)')
    }

    if (homepage && !isHttpUrl(homepage)) {
      return bad('Homepage must be a valid http(s) URL')
    }

    if (typeof pluginFile.name !== 'string' || !pluginFile.name.toLowerCase().endsWith(PLUGIN_FILE_EXT)) {
      return bad(`Plugin file must be ${PLUGIN_FILE_EXT} format`)
    }
    if (typeof pluginFile.size !== 'number' || pluginFile.size <= 0) {
      return bad('Plugin file is empty')
    }
    if (pluginFile.size > MAX_PLUGIN_BYTES) {
      return bad(`Plugin file exceeds ${Math.floor(MAX_PLUGIN_BYTES / 1024 / 1024)}MB limit`)
    }

    // ולידציית תמונה ראשית
    let imageMeta = null
    if (imageFile && imageFile.size > 0) {
      if (!isAllowedImage(imageFile.type)) {
        return bad('Image must be one of: png, jpeg, webp, gif')
      }
      if (imageFile.size > MAX_IMAGE_BYTES) {
        return bad(`Image exceeds ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB limit`)
      }
      imageMeta = { ext: imageExtFromMime(imageFile.type), contentType: imageFile.type.toLowerCase() }
    }

    // ולידציית צילומי מסך
    if (screenshotFiles.length > MAX_SCREENSHOTS) {
      return bad(`Too many screenshots (max ${MAX_SCREENSHOTS})`)
    }
    const screenshotMeta = []
    for (const s of screenshotFiles) {
      if (!isAllowedImage(s.type)) {
        return bad('Screenshots must be png, jpeg, webp, or gif')
      }
      if (s.size > MAX_SCREENSHOT_BYTES) {
        return bad(`Screenshot exceeds ${Math.floor(MAX_SCREENSHOT_BYTES / 1024 / 1024)}MB limit`)
      }
      screenshotMeta.push({ ext: imageExtFromMime(s.type), contentType: s.type.toLowerCase() })
    }

    await dbConnect()

    // יצירת המסמך תחילה (עם retry על duplicate-key לטיפול ב-race ב-slug)
    const baseSlug = createSlug(name)
    if (!SLUG_RE.test(baseSlug)) {
      // הגנה - createSlug אמור להבטיח את זה, אבל מוודאים סופית.
      return bad('Failed to derive a valid slug from name', 500)
    }
    let plugin = null
    for (let attempt = 0; attempt < 5 && !plugin; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`
      try {
        plugin = await Plugin.create({
          name,
          slug,
          shortDescription,
          description,
          version,
          status: statusVal,
          author,
          authorId: session.user.id,
          compatibleWith,
          tags,
          pluginFileName: path.basename(pluginFile.name),
          pluginFileExt: PLUGIN_FILE_EXT,
          pluginFileSize: pluginFile.size,
          image: imageMeta || { ext: null, contentType: null },
          screenshots: screenshotMeta,
          homepage,
          installInstructions,
          isApproved: false
        })
      } catch (err) {
        if (err && err.code === 11000) continue
        throw err
      }
    }
    if (!plugin) {
      return bad('Failed to allocate unique slug', 500)
    }
    createdPluginId = plugin._id.toString()

    // כתיבת הקבצים לדיסק
    const dir = await ensurePluginDir(createdPluginId)
    await saveFileFromFormData(
      pluginFile,
      path.join(dir, `${PLUGIN_FILE_BASENAME}${PLUGIN_FILE_EXT}`),
      MAX_PLUGIN_BYTES
    )
    if (imageFile && imageMeta) {
      await saveFileFromFormData(
        imageFile,
        path.join(dir, `${IMAGE_BASENAME}${imageMeta.ext}`),
        MAX_IMAGE_BYTES
      )
    }
    for (let i = 0; i < screenshotFiles.length; i++) {
      await saveFileFromFormData(
        screenshotFiles[i],
        path.join(dir, 'screenshots', `${i}${screenshotMeta[i].ext}`),
        MAX_SCREENSHOT_BYTES
      )
    }

    // שליחת התראה למנהלים
    try {
      await sendPluginUploadNotification({
        pluginName: name,
        version,
        author,
        uploadedBy: session.user.name || session.user.email,
        uploaderEmail: session.user.email,
        shortDescription
      })
    } catch (emailError) {
      console.error('Failed to send plugin upload notification:', emailError)
    }

    return NextResponse.json({
      success: true,
      message: 'Plugin uploaded successfully and waiting for approval',
      plugin: {
        id: plugin._id,
        name: plugin.name,
        slug: plugin.slug
      }
    }, { status: 201 })
  } catch (error) {
    console.error('Error uploading plugin:', error)
    // ניקוי במקרה של כשל לאחר יצירת המסמך
    if (createdPluginId) {
      try {
        await Plugin.findByIdAndDelete(createdPluginId)
        await deletePluginDir(createdPluginId)
      } catch (cleanupErr) {
        console.error('Cleanup after failed upload errored:', cleanupErr)
      }
    }
    return bad('Failed to upload plugin', 500)
  }
}
