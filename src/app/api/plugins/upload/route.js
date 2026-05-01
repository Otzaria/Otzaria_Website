import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import path from 'path'
import crypto from 'crypto'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { sendPluginUploadNotification } from '@/lib/emailService'
import {
  ALLOWED_PLUGIN_STATUSES,
  PLUGIN_VERSION_RE,
  assertPluginTextLimits,
  isHttpUrl,
  normalizeInstructions,
  normalizeTags,
  parseJsonArrayField
} from '@/lib/pluginSubmission'
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
      tags = normalizeTags(parseJsonArrayField(formData.get('tags'), 'tags'))
    } catch {
      return bad('Invalid tags format')
    }

    let installInstructions = []
    try {
      installInstructions = normalizeInstructions(
        parseJsonArrayField(formData.get('installInstructions'), 'installInstructions')
      )
    } catch {
      return bad('Invalid installInstructions format')
    }

    if (!ALLOWED_PLUGIN_STATUSES.includes(statusVal)) {
      return bad(`Status must be one of: ${ALLOWED_PLUGIN_STATUSES.join(', ')}`)
    }

    const pluginFile = formData.get('pluginFile')
    const imageFile = formData.get('imageFile')
    const screenshotFiles = formData.getAll('screenshots').filter(f => f && f.size > 0)

    if (!name || !shortDescription || !description || !version || !author || !compatibleWith || !pluginFile) {
      return bad('Missing required fields')
    }

    try {
      assertPluginTextLimits({
        name,
        shortDescription,
        description,
        version,
        author,
        compatibleWith,
        homepage,
        tags,
        installInstructions
      })
    } catch (error) {
      return bad(error.message)
    }

    if (!PLUGIN_VERSION_RE.test(version)) {
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
          isApproved: false,
          submissionType: 'new',
          lastSubmittedBy: session.user.id,
          lastSubmittedAt: new Date()
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
        submissionType: 'new',
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
