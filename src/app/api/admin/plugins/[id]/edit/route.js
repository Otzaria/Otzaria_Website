import crypto from 'crypto'
import path from 'path'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { promises as fs } from 'fs'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { sendPluginUploadNotification } from '@/lib/emailService'
import { hasPluginsAccess } from '@/lib/roles'
import {
  ALLOWED_PLUGIN_STATUSES,
  MIN_SUPPORTED_APP_VERSION,
  PLUGIN_VERSION_RE,
  assertPluginTextLimits,
  formatPluginForPublic,
  getEditableSource,
  getLivePluginData,
  isHttpUrl,
  normalizeTags,
  parseJsonArrayField
} from '@/lib/pluginSubmission'
import { readManifestFromPlugin, compareVersions } from '@/lib/pluginManifest'
import { invalidatePluginSearchIndex } from '@/lib/pluginSearchIndex'
import { archiveCurrentVersion } from '@/lib/pluginVersions'
import { validatePluginArchive, OTZARIA_DESIGN_TAG } from '@/lib/pluginValidation'
import { buildCompanionMeta, companionFromDoc, emptyCompanion } from '@/lib/pluginCompanion'
import { sendPluginReportNoticeIfNeeded } from '@/lib/systemMessages'
import {
  MAX_COMPANION_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PLUGIN_BYTES,
  MAX_SCREENSHOTS,
  MAX_SCREENSHOT_BYTES,
  COMPANION_BASENAME,
  PLUGIN_FILE_BASENAME,
  IMAGE_BASENAME,
  deletePendingPluginDir,
  ensurePluginDir,
  getPendingPluginDir,
  imageExtFromMime,
  isAllowedImage,
  readPluginAsset,
  removePluginAsset,
  saveBufferAtomic,
  saveFileFromFormData,
  saveOptimizedImage,
  clearImageOptCache
} from '@/lib/pluginStorage'

const PLUGIN_FILE_EXT = '.otzplugin'

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function getAssetSources(source) {
  return {
    pluginFile: source.assetSources?.pluginFile || 'live',
    image: source.assetSources?.image || (source.image ? 'live' : 'none'),
    screenshots: source.assetSources?.screenshots || ((source.screenshots || []).length ? 'live' : 'none')
  }
}

// asOwner: הבקשה הגיעה מהנתיב הציבורי (/api/plugins/[id]/edit) — שם כל אחד,
// גם מנהל, עורך את התוסף שלו כמשתמש רגיל לכל דבר (השדות נגזרים מהמניפסט,
// חובה להעלות גרסה וכו'). הרשאות המנהל זמינות רק דרך ממשק הניהול.
async function getAuthorizedPlugin(id, session, { asOwner = false } = {}) {
  await dbConnect()

  const plugin = await Plugin.findById(id)
  if (!plugin || plugin.isHidden) {
    return { error: bad('Plugin not found', 404) }
  }

  const isOwner = plugin.authorId?.toString() === session.user?.id
  const isAdmin = asOwner ? false : hasPluginsAccess(session.user?.role)
  if (!isAdmin && !isOwner) {
    return {
      error: bad(
        asOwner && hasPluginsAccess(session.user?.role)
          ? 'עריכת תוספים כמנהל זמינה רק בממשק הניהול.'
          : 'Forbidden - You do not have permission to edit this plugin',
        403
      )
    }
  }

  return { plugin, isAdmin, isOwner }
}

// מחזיר את מזהה התוסף (id מתוך manifest.json). אם טרם נשמר pluginUid (תוספים ישנים
// שקדמו לשמירת המזהה) — קורא את הקובץ החי מהדיסק ומחלץ ממנו את ה-id, כדי שאפשר יהיה
// לאכוף זהות קבועה גם עליהם. מחזיר מחרוזת ריקה אם לא נמצא מזהה.
async function resolveExistingManifestId(plugin) {
  const stored = (plugin.pluginUid || '').toString().trim()
  if (stored) return stored
  try {
    const buffer = await readPluginAsset(
      plugin._id.toString(),
      `${PLUGIN_FILE_BASENAME}${plugin.pluginFileExt || PLUGIN_FILE_EXT}`
    )
    const manifest = readManifestFromPlugin(buffer)
    return (manifest.id || '').toString().trim()
  } catch {
    return ''
  }
}

function buildEditResponse(plugin, source) {
  const pluginId = plugin._id.toString()
  const pending = Boolean(plugin.pendingUpdate)
  return {
    ...formatPluginForPublic(plugin, { usePending: pending }),
    _id: pluginId,
    pluginUid: plugin.pluginUid || null,
    authorId: plugin.authorId?.toString() || null,
    pluginFileName: source.pluginFileName || '',
    isApproved: plugin.isApproved,
    hasPendingUpdate: pending,
    submissionType: plugin.submissionType || 'new',
    imageData: Boolean(source.image),
    screenshots: (source.screenshots || []).map((_, index) => `/api/plugins/${pluginId}/screenshots/${index}${pending ? '?pending=1' : ''}`),
    pendingChangeSummary: plugin.pendingChangeSummary || []
  }
}

async function removeLiveImage(pluginId, plugin) {
  if (plugin.image?.ext) {
    await removePluginAsset(pluginId, `${IMAGE_BASENAME}${plugin.image.ext}`).catch(() => {})
  }
}

async function removeLiveScreenshots(pluginId, plugin) {
  for (let index = 0; index < (plugin.screenshots || []).length; index += 1) {
    const screenshot = plugin.screenshots[index]
    if (screenshot?.ext) {
      await removePluginAsset(pluginId, path.join('screenshots', `${index}${screenshot.ext}`)).catch(() => {})
    }
  }
}

async function saveLiveAssets(pluginId, plugin, editableSource, nextPluginData, files) {
  const dir = await ensurePluginDir(pluginId)
  const pendingDir = getPendingPluginDir(pluginId)

  if (files.pluginFile) {
    await saveFileFromFormData(
      files.pluginFile,
      path.join(dir, `${PLUGIN_FILE_BASENAME}${PLUGIN_FILE_EXT}`),
      MAX_PLUGIN_BYTES
    )
  } else if (editableSource.assetSources?.pluginFile === 'pending') {
    const target = path.join(dir, `${PLUGIN_FILE_BASENAME}${PLUGIN_FILE_EXT}`)
    await fs.rm(target, { force: true })
    await fs.rename(path.join(pendingDir, `${PLUGIN_FILE_BASENAME}${PLUGIN_FILE_EXT}`), target)
  }

  if (files.removeImage) {
    await removeLiveImage(pluginId, plugin)
    await clearImageOptCache(pluginId)
    nextPluginData.image = null
  } else if (files.imageFile) {
    await removeLiveImage(pluginId, plugin)
    await clearImageOptCache(pluginId)
    nextPluginData.image = await saveOptimizedImage(files.imageFile, dir, IMAGE_BASENAME, { maxWidth: 1200 })
  } else if (editableSource.assetSources?.image === 'pending' && editableSource.image?.ext) {
    await removeLiveImage(pluginId, plugin)
    await clearImageOptCache(pluginId)
    const target = path.join(dir, `${IMAGE_BASENAME}${editableSource.image.ext}`)
    await fs.rm(target, { force: true })
    await fs.rename(path.join(pendingDir, `${IMAGE_BASENAME}${editableSource.image.ext}`), target)
  }

  if (files.removeScreenshots || files.screenshotFiles.length > 0) {
    await removeLiveScreenshots(pluginId, plugin)
  }

  if (files.screenshotFiles.length > 0) {
    for (let index = 0; index < files.screenshotFiles.length; index += 1) {
      nextPluginData.screenshots[index] = await saveOptimizedImage(files.screenshotFiles[index], path.join(dir, 'screenshots'), String(index), { maxWidth: 1920 })
    }
  } else if (editableSource.assetSources?.screenshots === 'pending') {
    await removeLiveScreenshots(pluginId, plugin)
    for (let index = 0; index < (editableSource.screenshots || []).length; index += 1) {
      const screenshot = editableSource.screenshots[index]
      const target = path.join(dir, 'screenshots', `${index}${screenshot.ext}`)
      await fs.rm(target, { force: true })
      await fs.rename(path.join(pendingDir, 'screenshots', `${index}${screenshot.ext}`), target)
    }
  }

  // מתקין התוכנה הנלווית. הקובץ הישן נמחק במפורש ולא נדרס, כי הסיומת עשויה
  // להשתנות מ-exe ל-msi, והוא יושב תחת שם אחר. הארכוב להיסטוריה כבר קרה
  // לפני הקריאה לכאן, ולכן המחיקה אינה מאבדת את הגרסה היוצאת.
  if (files.removeCompanion || files.companionBuffer) {
    const previousExt = plugin.companion?.ext
    if (previousExt) {
      await removePluginAsset(pluginId, `${COMPANION_BASENAME}${previousExt}`).catch(() => {})
    }
  }
  if (files.companionBuffer && files.companionMeta) {
    await saveBufferAtomic(
      files.companionBuffer,
      path.join(dir, `${COMPANION_BASENAME}${files.companionMeta.ext}`),
      MAX_COMPANION_BYTES
    )
  }
}

export async function GET(request, { params }, { asOwner = false } = {}) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return bad('Unauthorized - Please login', 401)
    }

    const { id } = await params
    const access = await getAuthorizedPlugin(id, session, { asOwner })
    if (access.error) {
      return access.error
    }

    const source = getEditableSource(access.plugin)
    return NextResponse.json(buildEditResponse(access.plugin, source))
  } catch (error) {
    console.error('Error loading plugin for edit:', error)
    return bad('Failed to load plugin', 500)
  }
}

export async function PUT(request, { params }, { asOwner = false } = {}) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return bad('Unauthorized - Please login', 401)
    }

    const { id } = await params
    const access = await getAuthorizedPlugin(id, session, { asOwner })
    if (access.error) {
      return access.error
    }

    const { plugin, isAdmin, isOwner } = access
    const livePlugin = getLivePluginData(plugin)
    const editableSource = getEditableSource(plugin)
    const formData = await request.formData()

    let name = (formData.get('name') || '').toString().trim()
    let shortDescription = (formData.get('shortDescription') || '').toString().trim()
    const description = (formData.get('description') || '').toString()
    let version = (formData.get('version') || '').toString().trim()
    let status = isAdmin
      ? (formData.get('status') || '').toString().trim()
      : (editableSource.status || livePlugin.status || 'stable')
    let author = (formData.get('author') || '').toString().trim()
    let compatibleWith = isAdmin
      ? (formData.get('compatibleWith') || '').toString().trim()
      : (editableSource.compatibleWith || livePlugin.compatibleWith || '')
    // maxAppVersion: מנהל יכול לערוך ידנית (שדה ריק מפורש = הסרת התקרה). בהיעדר
    // השדה בטופס שומרים את הקיים. לבעלים נגזר מהמניפסט בהחלפת קובץ (בהמשך).
    const existingMaxAppVersion =
      editableSource.maxAppVersion || livePlugin.maxAppVersion || null
    let maxAppVersion = isAdmin && formData.has('maxAppVersion')
      ? ((formData.get('maxAppVersion') || '').toString().trim() || null)
      : existingMaxAppVersion
    let homepage = isAdmin
      ? (formData.get('homepage') || '').toString().trim()
      : (editableSource.homepage || livePlugin.homepage || '')
    // requiresNetwork: מנהל יכול לערוך ידנית. לבעלים — נגזר מהמניפסט בהחלפת קובץ
    // (בהמשך הקוד), אחרת שומרים את הערך הקיים מהמקור הניתן לעריכה.
    let requiresNetwork = isAdmin
      ? formData.get('requiresNetwork') === 'true'
      : (editableSource.requiresNetwork ?? livePlugin.requiresNetwork) === true

    let tags
    try {
      tags = normalizeTags(parseJsonArrayField(formData.get('tags'), 'tags'))
    } catch (error) {
      return bad(error.message)
    }

    if (!name || !shortDescription || !description || !version || !author || !compatibleWith) {
      return bad('Missing required fields')
    }
    if (!ALLOWED_PLUGIN_STATUSES.includes(status)) {
      return bad(`Status must be one of: ${ALLOWED_PLUGIN_STATUSES.join(', ')}`)
    }
    // הטופס מגיש את הגרסה החיה מה-DB גם כשלא נגעו בה. תוסף שפורסם בגרסה ישנה
    // ("1.0", "1.0.0.1") נחסם כאן מכל עריכת מטא-דאטה, ולכן אוכפים רק על גרסה חדשה.
    if (version !== livePlugin.version && !PLUGIN_VERSION_RE.test(version)) {
      return bad('Version must be in the form X.Y.Z')
    }
    if (maxAppVersion) {
      if (!PLUGIN_VERSION_RE.test(maxAppVersion)) {
        return bad('שדה maxAppVersion אינו בפורמט גרסה תקין')
      }
      if (compareVersions(maxAppVersion, compatibleWith) < 0) {
        return bad(`גרסת המקסימום (${maxAppVersion}) לא יכולה להיות נמוכה מגרסת המינימום (${compatibleWith})`)
      }
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
        tags
      })
    } catch (error) {
      return bad(error.message)
    }

    const pluginFile = formData.get('pluginFile')
    const imageFile = formData.get('imageFile')
    const screenshotFiles = formData.getAll('screenshots').filter(file => file && file.size > 0)
    const removeImage = formData.get('removeImage') === 'true'
    const removeScreenshots = formData.get('removeScreenshots') === 'true'

    let pluginBuffer = null
    // designCompliantFromFile: true → הקובץ עבר את בדיקת תאימות העיצוב; null → לא הועלה קובץ חדש
    // ועל כן יש להישען על מצב התגית הקיים. false → קובץ הועלה ולא עבר.
    let designCompliantFromFile = null
    let designViolations = []
    let usedApiMethods = []
    if (pluginFile?.size) {
      if (!pluginFile.name.toLowerCase().endsWith(PLUGIN_FILE_EXT)) {
        return bad('Plugin file must be .otzplugin format')
      }
      if (pluginFile.size > MAX_PLUGIN_BYTES) {
        return bad(`Plugin file exceeds ${Math.floor(MAX_PLUGIN_BYTES / 1024 / 1024)}MB limit`)
      }
      pluginBuffer = Buffer.from(await pluginFile.arrayBuffer())
      try {
        const validation = await validatePluginArchive(pluginBuffer)
        const issues = [...validation.errors, ...validation.warnings]
        if (issues.length > 0) {
          return bad(`קובץ התוסף לא עבר ולידציה מול ה-SDK הרשמי:\n- ${issues.join('\n- ')}`)
        }
        designCompliantFromFile = validation.design?.compliant === true
        designViolations = validation.design?.violations || []
        usedApiMethods = validation.usedApiMethods || []
      } catch (validationError) {
        console.error('Plugin validation crashed during edit:', validationError)
      }
    }

    // אכיפת תגית "מראה תואם לאוצריא": אם הוחלף קובץ — נסמך על הבדיקה החדשה.
    // אם לא הוחלף — נסמך על המצב הקיים של התוסף (הוא כבר נבדק כשהקובץ הועלה).
    const userRequestedDesignTag = tags.includes(OTZARIA_DESIGN_TAG)
    const pluginAlreadyHadTag = Array.isArray(livePlugin.tags) && livePlugin.tags.includes(OTZARIA_DESIGN_TAG)
    let designCompliant = designCompliantFromFile === null
      ? pluginAlreadyHadTag
      : designCompliantFromFile

    // לא הועלה קובץ חדש אך המשתמש מבקש את התג והתוסף עדיין אינו נושא אותו —
    // נבדוק את הקובץ המאוחסן עצמו (נחוץ לתוספים שהועלו לפני עדכון כללי בדיקת
    // העיצוב). חשוב לקרוא את אותו קובץ שייכנס לאישור: אם המקור הנערך הוא
    // pendingUpdate — את קובץ ה-pending, בדיוק כפי ש-download route עושה.
    if (userRequestedDesignTag && !designCompliant && designCompliantFromFile === null) {
      try {
        const usePendingAsset = getAssetSources(editableSource).pluginFile === 'pending'
        const fileExt = (usePendingAsset
          ? (editableSource.pluginFileExt || plugin.pluginFileExt)
          : plugin.pluginFileExt) || PLUGIN_FILE_EXT
        const liveBuffer = await readPluginAsset(
          plugin._id.toString(),
          `${PLUGIN_FILE_BASENAME}${fileExt}`,
          { pending: usePendingAsset }
        )
        const liveValidation = await validatePluginArchive(liveBuffer)
        designViolations = liveValidation.design?.violations || []
        designCompliant = liveValidation.design?.compliant === true
      } catch (err) {
        console.error('Re-validating stored plugin for design tag failed:', err)
        designViolations = ['שגיאה בקריאת או בבדיקת קובץ התוסף המאוחסן: ' + err.message]
      }
    }

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
    if (!designCompliant && userRequestedDesignTag) {
      // הגנת בטחון - לא אמור להגיע לכאן כי נחסם למעלה.
      tags = tags.filter(tag => tag !== OTZARIA_DESIGN_TAG)
    }

    if (imageFile?.size) {
      if (!isAllowedImage(imageFile.type)) {
        return bad('Image must be one of: png, jpeg, webp, gif')
      }
      if (imageFile.size > MAX_IMAGE_BYTES) {
        return bad(`Image exceeds ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB limit`)
      }
    }

    if (screenshotFiles.length > MAX_SCREENSHOTS) {
      return bad(`Too many screenshots (max ${MAX_SCREENSHOTS})`)
    }
    for (const screenshot of screenshotFiles) {
      if (!isAllowedImage(screenshot.type)) {
        return bad('Screenshots must be png, jpeg, webp, or gif')
      }
      if (screenshot.size > MAX_SCREENSHOT_BYTES) {
        return bad(`Screenshot exceeds ${Math.floor(MAX_SCREENSHOT_BYTES / 1024 / 1024)}MB limit`)
      }
    }

    // ===== תוכנה נלווית =====
    // אינה נגזרת מ-manifest.json (המתקין אינו חלק מחבילת התוסף), ולכן גם הבעלים
    // עורך אותה ידנית. removeCompanion=true מסיר, קובץ חדש מחליף, ובלי קובץ חדש
    // נערכת המטא-דאטה של המתקין הקיים. טופס שאינו שולח את השדות כלל משאיר את
    // הקיים כמו שהוא — כדי שלקוח ותיק לא ימחק תוכנה נלווית בשקט.
    const companionFile = formData.get('companionFile')
    const removeCompanion = formData.get('removeCompanion') === 'true'
    const existingCompanion =
      companionFromDoc(editableSource.companion) || companionFromDoc(livePlugin.companion)
    let companionBuffer = null
    let nextCompanion = existingCompanion
    if (removeCompanion) {
      nextCompanion = null
    } else if (companionFile?.size) {
      if (companionFile.size > MAX_COMPANION_BYTES) {
        return bad(`קובץ המתקין חורג מהמגבלה של ${Math.floor(MAX_COMPANION_BYTES / 1024 / 1024)}MB`)
      }
      companionBuffer = Buffer.from(await companionFile.arrayBuffer())
      try {
        nextCompanion = buildCompanionMeta({
          fileName: companionFile.name,
          size: companionFile.size,
          sha256: crypto.createHash('sha256').update(companionBuffer).digest('hex'),
          platform: formData.get('companionPlatform'),
          name: formData.get('companionName'),
          version: formData.get('companionVersion'),
          installsPlugin: formData.get('companionInstallsPlugin') === 'true',
          maxBytes: MAX_COMPANION_BYTES
        })
      } catch (error) {
        return bad(error.message)
      }
    } else if (existingCompanion && formData.has('companionName')) {
      // עריכת מטא-דאטה בלבד — אותו קובץ מתקין, ולכן אותו גיבוב ואותו גודל.
      try {
        nextCompanion = buildCompanionMeta({
          fileName: existingCompanion.fileName,
          size: existingCompanion.size,
          sha256: existingCompanion.sha256,
          platform: formData.get('companionPlatform') || existingCompanion.platform,
          name: formData.get('companionName'),
          version: formData.has('companionVersion')
            ? formData.get('companionVersion')
            : existingCompanion.version,
          installsPlugin: formData.has('companionInstallsPlugin')
            ? formData.get('companionInstallsPlugin') === 'true'
            : existingCompanion.installsPlugin,
          maxBytes: MAX_COMPANION_BYTES
        })
      } catch (error) {
        return bad(error.message)
      }
    }

    const isOwnerResubmission = isOwner && !isAdmin

    // pluginUidToPersist: המזהה (id) לשמירה אם הוחלף קובץ. נשמר בעת ה-save בהמשך.
    let pluginUidToPersist = null

    // החלפת קובץ תוסף — אוכפים את זהות התוסף ואת אי-ירידת הגרסה עבור מנהל ויוצר כאחד.
    if (pluginFile?.size) {
      let newManifest
      try {
        newManifest = readManifestFromPlugin(pluginBuffer)
      } catch {
        return bad('לא ניתן לקרוא את manifest.json מקובץ התוסף')
      }

      // המזהה (id) חייב להישאר זהה לאורך חיי התוסף — אסור לשנותו בעדכון.
      const manifestId = (newManifest.id || '').toString().trim()
      if (!manifestId) {
        return bad('חסר שדה id ב-manifest.json של קובץ התוסף')
      }
      const existingId = await resolveExistingManifestId(plugin)
      if (existingId && manifestId !== existingId) {
        return bad(`המזהה (id) בקובץ (${manifestId}) חייב להיות זהה למזהה הקיים של התוסף (${existingId})`)
      }
      pluginUidToPersist = manifestId

      const manifestVersion = (newManifest.version || '').toString().trim()
      if (!manifestVersion) {
        return bad('חסר שדה גרסה ב-manifest.json של קובץ התוסף')
      }
      if (!PLUGIN_VERSION_RE.test(manifestVersion)) {
        return bad('גרסה לא תקינה ב-manifest.json של קובץ התוסף (נדרש פורמט X.Y.Z)')
      }
      // היוצר חייב להעלות גרסה גבוהה מהקיימת. מנהל רשאי לשמור גם על אותה גרסה
      // (למשל החלפת קובץ לתיקון), אך לעולם לא לשנמך — ירידה נחסמת בהמשך לכולם.
      if (!isAdmin && compareVersions(manifestVersion, livePlugin.version) <= 0) {
        return bad(`הגרסה בקובץ (${manifestVersion}) חייבת להיות גבוהה מהגרסה הנוכחית (${livePlugin.version})`)
      }
      version = manifestVersion

      // היוצר — שאר המטא-דאטה המוגנת נגזרת מהמניפסט (מנהל עורך אותה ידנית בטופס).
      if (!isAdmin) {
        // ברירת מחדל זהה לאוצריא ולוולידטור ה-CI — ראו upload/route.js.
        const manifestStability = (newManifest.stability || 'stable').toString().trim()
        if (!ALLOWED_PLUGIN_STATUSES.includes(manifestStability)) {
          return bad('ערך stability לא תקין ב-manifest.json (ערכים מותרים: stable, beta, experimental)')
        }
        const manifestMinAppVersion = newManifest.minAppVersion ? newManifest.minAppVersion.toString().trim() : ''
        if (!manifestMinAppVersion) {
          return bad('חסר שדה minAppVersion ב-manifest.json של קובץ התוסף')
        }
        if (compareVersions(manifestMinAppVersion, MIN_SUPPORTED_APP_VERSION) < 0) {
          return bad(`גרסת המינימום (${manifestMinAppVersion}) לא יכולה להיות פחות מ-${MIN_SUPPORTED_APP_VERSION}`)
        }
        const manifestName = (newManifest.name || '').toString().trim()
        const manifestAuthor = (newManifest.author || '').toString().trim()
        const manifestDesc = (newManifest.description || '').toString().trim()
        if (manifestName) name = manifestName
        if (manifestAuthor) author = manifestAuthor
        if (manifestDesc) shortDescription = manifestDesc
        status = manifestStability
        compatibleWith = manifestMinAppVersion
        const manifestMaxAppVersion = newManifest.maxAppVersion ? newManifest.maxAppVersion.toString().trim() : ''
        if (manifestMaxAppVersion) {
          if (!PLUGIN_VERSION_RE.test(manifestMaxAppVersion)) {
            return bad('שדה maxAppVersion ב-manifest.json אינו בפורמט גרסה תקין')
          }
          if (compareVersions(manifestMaxAppVersion, manifestMinAppVersion) < 0) {
            return bad(`גרסת המקסימום (${manifestMaxAppVersion}) לא יכולה להיות נמוכה מגרסת המינימום (${manifestMinAppVersion})`)
          }
        }
        maxAppVersion = manifestMaxAppVersion || null
        homepage = newManifest.homepage ? newManifest.homepage.toString().trim() : ''
        requiresNetwork = newManifest.network?.enabled === true
      }
    }

    // משתמש רגיל (לא מנהל) שעורך ללא העלאת קובץ — השדות הנגזרים מ-manifest.json מוסתרים
    // בטופס ואינם ניתנים לעריכה ידנית. אוכפים בשרת שיישארו זהים למקור הקיים, כדי שלא
    // ייווצר חוסר התאמה בין מסד הנתונים לבין הקובץ המאוחסן (עקיפה ישירה דרך PUT).
    if (!isAdmin && !pluginFile?.size) {
      name = editableSource.name || livePlugin.name
      author = editableSource.author || livePlugin.author
      version = editableSource.version || livePlugin.version
      shortDescription = editableSource.shortDescription || livePlugin.shortDescription
    }

    // אכיפת אי-ירידת גרסה גם בעריכה ללא החלפת קובץ (למשל מנהל שעורך ידנית את שדה הגרסה).
    if (compareVersions(version, livePlugin.version) < 0) {
      return bad(`לא ניתן להוריד את גרסת התוסף. הגרסה (${version}) חייבת להיות זהה או גבוהה מהגרסה הנוכחית (${livePlugin.version}).`)
    }

    if (homepage && !isHttpUrl(homepage)) {
      return bad('Homepage must be a valid http(s) URL')
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
        tags
      })
    } catch (error) {
      return bad(error.message)
    }

    const nextPluginData = {
      name,
      shortDescription,
      description,
      version,
      status,
      author,
      compatibleWith,
      maxAppVersion,
      requiresNetwork,
      tags,
      homepage,
      pluginFileName: editableSource.pluginFileName || livePlugin.pluginFileName,
      pluginFileExt: PLUGIN_FILE_EXT,
      pluginFileSize: editableSource.pluginFileSize || livePlugin.pluginFileSize || 0,
      image: editableSource.image ? { ...editableSource.image } : null,
      screenshots: (editableSource.screenshots || []).map((screenshot) => ({ ...screenshot })),
      companion: nextCompanion || emptyCompanion(),
      assetSources: getAssetSources(editableSource)
    }

    if (pluginFile?.size) {
      nextPluginData.pluginFileName = path.basename(pluginFile.name)
      nextPluginData.pluginFileSize = pluginFile.size
    }
    if (imageFile?.size) {
      nextPluginData.image = {
        ext: imageExtFromMime(imageFile.type),
        contentType: imageFile.type.toLowerCase()
      }
    }
    if (removeScreenshots) {
      nextPluginData.screenshots = []
    } else if (screenshotFiles.length > 0) {
      nextPluginData.screenshots = screenshotFiles.map((file) => ({
        ext: imageExtFromMime(file.type),
        contentType: file.type.toLowerCase()
      }))
    }

    let pendingApproval = false
    let message = 'השינויים נשמרו בהצלחה.'

    {
      // עדכון חי של תוסף שכבר פומבי + עליית גרסה ממש → מארכבים את הגרסה היוצאת
      // להיסטוריה לפני שהקובץ החי נדרס. עריכה ללא שינוי מספר הגרסה דורסת ואינה נשמרת.
      // יש לארכב לפני saveLiveAssets (שמחליף את הקובץ) ולפני עדכון שדות התוסף.
      if (plugin.isApproved && compareVersions(nextPluginData.version, livePlugin.version) > 0) {
        try {
          await archiveCurrentVersion(plugin)
        } catch (archiveErr) {
          console.error('Failed to archive outgoing plugin version:', archiveErr)
          // הארכוב הכרחי — בלעדיו תאבד הגרסה הקיימת ומשתמשים בגרסת אוצריא ישנה
          // לא יוכלו לקבל את הגרסה התואמת הקודמת. נחסם לפני דריסת הקובץ החי.
          return bad('שמירת הגרסה הקודמת בהיסטוריה נכשלה. השינויים לא נשמרו כדי לא לאבד את הגרסה הקיימת.', 500)
        }
      }

      await saveLiveAssets(plugin._id.toString(), plugin, editableSource, nextPluginData, {
        pluginFile: pluginFile?.size ? pluginFile : null,
        imageFile: imageFile?.size ? imageFile : null,
        screenshotFiles,
        removeImage,
        removeScreenshots,
        companionBuffer,
        companionMeta: nextCompanion,
        removeCompanion
      })

      plugin.name = nextPluginData.name
      plugin.shortDescription = nextPluginData.shortDescription
      plugin.description = nextPluginData.description
      plugin.version = nextPluginData.version
      plugin.status = nextPluginData.status
      plugin.author = nextPluginData.author
      plugin.compatibleWith = nextPluginData.compatibleWith
      plugin.maxAppVersion = nextPluginData.maxAppVersion || null
      plugin.requiresNetwork = nextPluginData.requiresNetwork === true
      plugin.tags = nextPluginData.tags
      plugin.homepage = nextPluginData.homepage
      plugin.pluginFileName = nextPluginData.pluginFileName
      plugin.pluginFileExt = nextPluginData.pluginFileExt
      plugin.pluginFileSize = nextPluginData.pluginFileSize
      // תאריך "עודכן" בחנות משקף רק החלפה בפועל של קובץ התוסף — לא עריכת מטא-דאטה
      if (pluginFile?.size) {
        plugin.fileUpdatedAt = new Date()
      }
      plugin.image = nextPluginData.image || { ext: null, contentType: null }
      plugin.screenshots = nextPluginData.screenshots
      plugin.companion = nextPluginData.companion
      plugin.pendingUpdate = null
      plugin.pendingChangeSummary = []
      // מנהל שעורך ישירות לא מחליף את המעלה המקורי
      if (!isAdmin || isOwner) {
        plugin.lastSubmittedBy = session.user.id
        plugin.lastSubmittedAt = new Date()
      }
      await deletePendingPluginDir(plugin._id.toString()).catch(() => {})

      if (isOwnerResubmission && !plugin.isApproved) {
        plugin.submissionType = 'new'
        plugin.isApproved = false
        plugin.approvedBy = null
        plugin.approvedAt = null
        pendingApproval = true
        message = 'השינויים נשמרו ונשלחו לאישור מנהל.'
      } else {
        plugin.submissionType = 'new'
      }
    }

    // שמירת זהות התוסף (id). קבוע לאורך חיי התוסף; כאן גם משלים backfill לתוספים ישנים.
    if (pluginUidToPersist) {
      plugin.pluginUid = pluginUidToPersist
    }

    await plugin.save()
    // עריכה ישירה (ללא pendingApproval) משנה את הנתונים החיים → רענון אינדקס החיפוש
    invalidatePluginSearchIndex()

    // אם הוחלף קובץ חדש שלא תאם לעיצוב — מציינים בהודעת ההצלחה שהתגית לא נוספה.
    if (designCompliantFromFile === false) {
      message += `\n(התגית "${OTZARIA_DESIGN_TAG}" לא נוספה — העיצוב אינו תואם להנחיות.)`
    }

    if (pendingApproval) {
      try {
        await sendPluginUploadNotification({
          submissionType: plugin.submissionType || 'new',
          pluginName: nextPluginData.name,
          version: nextPluginData.version,
          author: nextPluginData.author,
          uploadedBy: session.user.name || session.user.email,
          uploaderEmail: session.user.email,
          shortDescription: nextPluginData.shortDescription,
          changes: plugin.pendingChangeSummary || []
        })
      } catch (emailError) {
        console.error('Failed to send plugin update notification:', emailError)
      }
    }

    // ההודעה החד-פעמית נשלחת לבעל התוסף — הדיווחים מגיעים אליו, גם אם אדמין ערך
    if (plugin.authorId) {
      await sendPluginReportNoticeIfNeeded({ userId: plugin.authorId, usedApiMethods })
    }

    return NextResponse.json({
      success: true,
      pendingApproval,
      message,
      plugin: {
        id: plugin._id.toString(),
        name: plugin.name,
        slug: plugin.slug,
        isApproved: plugin.isApproved
      }
    })
  } catch (error) {
    if (error && error.code === 11000 && error.keyPattern && error.keyPattern.pluginUid) {
      return bad('כבר קיים תוסף אחר עם מזהה (id) זה ב-manifest.json. המזהה חייב להיות ייחודי.')
    }
    console.error('Error updating plugin:', error)
    return bad('Failed to update plugin', 500)
  }
}
