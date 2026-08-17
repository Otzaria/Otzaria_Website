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
  MIN_SUPPORTED_APP_VERSION,
  PLUGIN_VERSION_RE,
  assertPluginTextLimits,
  isHttpUrl,
  normalizeTags,
  parseJsonArrayField
} from '@/lib/pluginSubmission'
import { readManifestFromPlugin, compareVersions } from '@/lib/pluginManifest'
import { validatePluginArchive, OTZARIA_DESIGN_TAG } from '@/lib/pluginValidation'
import {
  MAX_PLUGIN_BYTES,
  MAX_IMAGE_BYTES,
  MAX_SCREENSHOT_BYTES,
  MAX_SCREENSHOTS,
  isAllowedImage,
  imageExtFromMime,
  ensurePluginDir,
  saveFileFromFormData,
  saveOptimizedImage,
  deletePluginDir,
  PLUGIN_FILE_BASENAME,
  IMAGE_BASENAME
} from '@/lib/pluginStorage'

const PLUGIN_FILE_EXT = '.otzplugin'
// slug באנגלית בלבד - אותיות קטנות, ספרות ומקפים. לא מתחיל/מסתיים במקף.
// נבדק: לינארי — מפריד '-' חובה בכל איטרציה מונע נסיגה קטסטרופלית
// eslint-disable-next-line security/detect-unsafe-regex
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

    const description = (formData.get('description') || '').toString()

    let tags = []
    try {
      tags = normalizeTags(parseJsonArrayField(formData.get('tags'), 'tags'))
    } catch {
      return bad('Invalid tags format')
    }

    const pluginFile = formData.get('pluginFile')
    const imageFile = formData.get('imageFile')
    const screenshotFiles = formData.getAll('screenshots').filter(f => f && f.size > 0)

    if (!description || !pluginFile) {
      return bad('Missing required fields')
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

    // Read name, author, version, shortDescription, status, compatibleWith from manifest
    const pluginBuffer = Buffer.from(await pluginFile.arrayBuffer())
    let name, author, version, shortDescription, statusFromManifest, compatibleWithFromManifest, maxAppVersionFromManifest, homepageFromManifest, requiresNetworkFromManifest, pluginUid
    try {
      const manifest = readManifestFromPlugin(pluginBuffer)
      pluginUid = (manifest.id || '').toString().trim()
      version = (manifest.version || '').toString().trim()
      name = (manifest.name || '').toString().trim()
      author = (manifest.author || '').toString().trim()
      shortDescription = (manifest.description || '').toString().trim()
      homepageFromManifest = (manifest.homepage || '').toString().trim()
      const stability = manifest.stability ? manifest.stability.toString().trim() : ''
      const minAppVersion = manifest.minAppVersion ? manifest.minAppVersion.toString().trim() : ''
      if (!stability || !ALLOWED_PLUGIN_STATUSES.includes(stability))
        return bad('חסר שדה stability תקין ב-manifest.json (ערכים מותרים: stable, beta, experimental)')
      statusFromManifest = stability
      if (!minAppVersion)
        return bad('חסר שדה minAppVersion ב-manifest.json של קובץ התוסף')
      if (compareVersions(minAppVersion, MIN_SUPPORTED_APP_VERSION) < 0)
        return bad(`גרסת המינימום (${minAppVersion}) לא יכולה להיות פחות מ-${MIN_SUPPORTED_APP_VERSION}`)
      compatibleWithFromManifest = minAppVersion
      const maxAppVersion = manifest.maxAppVersion ? manifest.maxAppVersion.toString().trim() : ''
      if (maxAppVersion) {
        if (!PLUGIN_VERSION_RE.test(maxAppVersion))
          return bad('שדה maxAppVersion ב-manifest.json אינו בפורמט גרסה תקין')
        if (compareVersions(maxAppVersion, minAppVersion) < 0)
          return bad(`גרסת המקסימום (${maxAppVersion}) לא יכולה להיות נמוכה מגרסת המינימום (${minAppVersion})`)
      }
      maxAppVersionFromManifest = maxAppVersion || null
      requiresNetworkFromManifest = manifest.network?.enabled === true
    } catch {
      return bad('לא ניתן לקרוא את manifest.json מקובץ התוסף')
    }
    if (!pluginUid) return bad('חסר שדה id ב-manifest.json של קובץ התוסף')
    if (!version) return bad('חסר שדה גרסה ב-manifest.json של קובץ התוסף')
    if (!PLUGIN_VERSION_RE.test(version)) return bad('גרסה לא תקינה ב-manifest.json של קובץ התוסף (נדרש פורמט X, X.Y, X.Y.Z)')
    if (!name) return bad('חסר שדה name ב-manifest.json של קובץ התוסף')
    if (!author) return bad('חסר שדה author ב-manifest.json של קובץ התוסף')
    if (!shortDescription) return bad('חסר שדה description ב-manifest.json של קובץ התוסף')

    // בדיקות תקינות מול ה-API הרשמי: הרשאות לא קיימות, קריאות API לא קיימות וכדומה.
    // errors ו-warnings חוסמים את ההעלאה — לא מאחסנים תוספים שאינם תואמים ל-SDK.
    // advisories (המלצות ניקיון, למשל הצהרה על הרשאת בסיס) אינם חוסמים: התוסף
    // תקין ועובד, וחסימה עליהם הייתה מקפיאה תוספים שאין בהם שום אי-תאימות.
    let designCompliant = false
    let designViolations = []
    try {
      const validation = await validatePluginArchive(pluginBuffer)
      const issues = [...validation.errors, ...validation.warnings]
      if (issues.length > 0) {
        return bad(`קובץ התוסף לא עבר ולידציה מול ה-SDK הרשמי:\n- ${issues.join('\n- ')}`)
      }
      designCompliant = validation.design?.compliant === true
      designViolations = validation.design?.violations || []
    } catch (validationError) {
      console.error('Plugin validation crashed:', validationError)
      // אם הולידציה עצמה נפלה, לא מבטלים את ההעלאה אלא מתעדים בלוג בלבד.
    }

    // אכיפת תגית "מראה תואם לאוצריא": אסור להוסיף ידנית בלי שהעיצוב באמת תואם;
    // נוסף אוטומטית כשהעיצוב כן תואם.
    const userRequestedDesignTag = tags.includes(OTZARIA_DESIGN_TAG)
    if (userRequestedDesignTag && !designCompliant) {
      const detail = designViolations.length > 0
        ? `\n- ${designViolations.join('\n- ')}`
        : ''
      return bad(
        `לא ניתן להוסיף את התגית "${OTZARIA_DESIGN_TAG}" — העיצוב אינו תואם ל-DESIGN_GUIDE.md:${detail}`
      )
    }
    if (designCompliant && !userRequestedDesignTag) {
      tags = [...tags, OTZARIA_DESIGN_TAG]
    }

    try {
      assertPluginTextLimits({
        name,
        shortDescription,
        description,
        version,
        author,
        compatibleWith: compatibleWithFromManifest,
        homepage: homepageFromManifest,
        tags
      })
    } catch (error) {
      return bad(error.message)
    }

    if (homepageFromManifest && !isHttpUrl(homepageFromManifest)) {
      return bad('Homepage must be a valid http(s) URL')
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
    if (screenshotFiles.length < 1) {
      return bad('חובה לצרף לפחות צילום מסך אחד. ללא צילום מסך התוסף יידחה')
    }
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

    // אכיפת ייחודיות המזהה (id) — אסור ששני תוספים שונים יחלקו את אותו manifest.id.
    const existingByUid = await Plugin.findOne({ pluginUid }).select('_id').lean()
    if (existingByUid) {
      return bad('כבר קיים תוסף עם מזהה (id) זה ב-manifest.json. יש להשתמש במזהה ייחודי.')
    }

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
          pluginUid,
          shortDescription,
          description,
          version,
          status: statusFromManifest,
          author,
          authorId: session.user.id,
          compatibleWith: compatibleWithFromManifest,
          maxAppVersion: maxAppVersionFromManifest,
          requiresNetwork: requiresNetworkFromManifest,
          tags,
          pluginFileName: path.basename(pluginFile.name),
          pluginFileExt: PLUGIN_FILE_EXT,
          pluginFileSize: pluginFile.size,
          fileUpdatedAt: new Date(),
          image: imageMeta || { ext: null, contentType: null },
          screenshots: screenshotMeta,
          homepage: homepageFromManifest,
          isApproved: false,
          submissionType: 'new',
          lastSubmittedBy: session.user.id,
          lastSubmittedAt: new Date()
        })
      } catch (err) {
        if (err && err.code === 11000) {
          // התנגשות במזהה התוסף לא נפתרת ע"י slug אחר (race מול בדיקת הייחודיות שמעל).
          if (err.keyPattern && err.keyPattern.pluginUid) {
            return bad('כבר קיים תוסף עם מזהה (id) זה ב-manifest.json. יש להשתמש במזהה ייחודי.')
          }
          continue
        }
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
      imageMeta = await saveOptimizedImage(imageFile, dir, IMAGE_BASENAME, { maxWidth: 1200 })
      plugin.image = imageMeta
    }
    for (let i = 0; i < screenshotFiles.length; i++) {
      screenshotMeta[i] = await saveOptimizedImage(screenshotFiles[i], path.join(dir, 'screenshots'), String(i), { maxWidth: 1920 })
    }
    plugin.screenshots = screenshotMeta
    await plugin.save()

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
      designCompliant,
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
