import path from 'path'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { promises as fs } from 'fs'
import dbConnect from '@/lib/db'
import Plugin from '@/models/Plugin'
import { sendPluginUploadNotification } from '@/lib/emailService'
import {
  ALLOWED_PLUGIN_STATUSES,
  PLUGIN_VERSION_RE,
  assertPluginTextLimits,
  buildChangeSummary,
  formatPluginForPublic,
  getEditableSource,
  getLivePluginData,
  isHttpUrl,
  normalizeInstructions,
  normalizeTags,
  parseJsonArrayField
} from '@/lib/pluginSubmission'
import {
  MAX_IMAGE_BYTES,
  MAX_PLUGIN_BYTES,
  MAX_SCREENSHOTS,
  MAX_SCREENSHOT_BYTES,
  PLUGIN_FILE_BASENAME,
  IMAGE_BASENAME,
  deletePendingPluginDir,
  ensurePendingPluginDir,
  ensurePluginDir,
  getPendingPluginDir,
  imageExtFromMime,
  isAllowedImage,
  removePluginAsset,
  saveFileFromFormData
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

function hasExplicitFileChanges(files) {
  return Boolean(
    files.pluginFile ||
    files.imageFile ||
    files.removeImage ||
    files.removeScreenshots ||
    files.screenshotFiles.length > 0
  )
}

async function getAuthorizedPlugin(id, session) {
  await dbConnect()

  const plugin = await Plugin.findById(id)
  if (!plugin || plugin.isHidden) {
    return { error: bad('Plugin not found', 404) }
  }

  const isAdmin = session.user?.role === 'admin'
  const isOwner = plugin.authorId?.toString() === session.user?.id
  if (!isAdmin && !isOwner) {
    return { error: bad('Forbidden - You do not have permission to edit this plugin', 403) }
  }

  return { plugin, isAdmin, isOwner }
}

function buildEditResponse(plugin, source) {
  const pluginId = plugin._id.toString()
  const pending = Boolean(plugin.pendingUpdate)
  return {
    ...formatPluginForPublic(plugin, { usePending: pending }),
    _id: pluginId,
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

async function savePendingSnapshot(pluginId, editableSource, nextPluginData, files) {
  const pendingDir = await ensurePendingPluginDir(pluginId)

  if (files.pluginFile) {
    await saveFileFromFormData(
      files.pluginFile,
      path.join(pendingDir, `${PLUGIN_FILE_BASENAME}${PLUGIN_FILE_EXT}`),
      MAX_PLUGIN_BYTES
    )
    nextPluginData.assetSources.pluginFile = 'pending'
  }

  if (files.removeImage) {
    nextPluginData.image = null
    nextPluginData.assetSources.image = 'none'
  } else if (files.imageFile) {
    if (editableSource.assetSources?.image === 'pending' && editableSource.image?.ext) {
      await removePluginAsset(pluginId, `${IMAGE_BASENAME}${editableSource.image.ext}`, { pending: true }).catch(() => {})
    }
    const ext = imageExtFromMime(files.imageFile.type)
    await saveFileFromFormData(
      files.imageFile,
      path.join(pendingDir, `${IMAGE_BASENAME}${ext}`),
      MAX_IMAGE_BYTES
    )
    nextPluginData.image = { ext, contentType: files.imageFile.type.toLowerCase() }
    nextPluginData.assetSources.image = 'pending'
  }

  if (files.removeScreenshots) {
    nextPluginData.screenshots = []
    nextPluginData.assetSources.screenshots = 'none'
  } else if (files.screenshotFiles.length > 0) {
    if (editableSource.assetSources?.screenshots === 'pending') {
      for (let index = 0; index < (editableSource.screenshots || []).length; index += 1) {
        const screenshot = editableSource.screenshots[index]
        if (screenshot?.ext) {
          await removePluginAsset(pluginId, path.join('screenshots', `${index}${screenshot.ext}`), { pending: true }).catch(() => {})
        }
      }
    }

    const screenshots = []
    for (let index = 0; index < files.screenshotFiles.length; index += 1) {
      const file = files.screenshotFiles[index]
      const ext = imageExtFromMime(file.type)
      await saveFileFromFormData(
        file,
        path.join(pendingDir, 'screenshots', `${index}${ext}`),
        MAX_SCREENSHOT_BYTES
      )
      screenshots.push({ ext, contentType: file.type.toLowerCase() })
    }
    nextPluginData.screenshots = screenshots
    nextPluginData.assetSources.screenshots = 'pending'
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
    nextPluginData.image = null
  } else if (files.imageFile) {
    await removeLiveImage(pluginId, plugin)
    await saveFileFromFormData(
      files.imageFile,
      path.join(dir, `${IMAGE_BASENAME}${nextPluginData.image.ext}`),
      MAX_IMAGE_BYTES
    )
  } else if (editableSource.assetSources?.image === 'pending' && editableSource.image?.ext) {
    await removeLiveImage(pluginId, plugin)
    const target = path.join(dir, `${IMAGE_BASENAME}${editableSource.image.ext}`)
    await fs.rm(target, { force: true })
    await fs.rename(path.join(pendingDir, `${IMAGE_BASENAME}${editableSource.image.ext}`), target)
  }

  if (files.removeScreenshots || files.screenshotFiles.length > 0) {
    await removeLiveScreenshots(pluginId, plugin)
  }

  if (files.screenshotFiles.length > 0) {
    for (let index = 0; index < files.screenshotFiles.length; index += 1) {
      await saveFileFromFormData(
        files.screenshotFiles[index],
        path.join(dir, 'screenshots', `${index}${nextPluginData.screenshots[index].ext}`),
        MAX_SCREENSHOT_BYTES
      )
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
}

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return bad('Unauthorized - Please login', 401)
    }

    const { id } = await params
    const access = await getAuthorizedPlugin(id, session)
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

export async function PUT(request, { params }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return bad('Unauthorized - Please login', 401)
    }

    const { id } = await params
    const access = await getAuthorizedPlugin(id, session)
    if (access.error) {
      return access.error
    }

    const { plugin, isAdmin, isOwner } = access
    const livePlugin = getLivePluginData(plugin)
    const editableSource = getEditableSource(plugin)
    const formData = await request.formData()

    const name = (formData.get('name') || '').toString().trim()
    const shortDescription = (formData.get('shortDescription') || '').toString().trim()
    const description = (formData.get('description') || '').toString()
    const version = (formData.get('version') || '').toString().trim()
    const status = (formData.get('status') || 'stable').toString()
    const author = (formData.get('author') || '').toString().trim()
    const compatibleWith = (formData.get('compatibleWith') || '').toString().trim()
    const homepage = (formData.get('homepage') || '').toString().trim()

    let tags
    let installInstructions
    try {
      tags = normalizeTags(parseJsonArrayField(formData.get('tags'), 'tags'))
      installInstructions = normalizeInstructions(
        parseJsonArrayField(formData.get('installInstructions'), 'installInstructions')
      )
    } catch (error) {
      return bad(error.message)
    }

    if (!name || !shortDescription || !description || !version || !author || !compatibleWith) {
      return bad('Missing required fields')
    }
    if (!ALLOWED_PLUGIN_STATUSES.includes(status)) {
      return bad(`Status must be one of: ${ALLOWED_PLUGIN_STATUSES.join(', ')}`)
    }
    if (!PLUGIN_VERSION_RE.test(version)) {
      return bad('Version must be in the form X, X.Y, X.Y.Z (optionally with -beta etc.)')
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
        tags,
        installInstructions
      })
    } catch (error) {
      return bad(error.message)
    }

    const pluginFile = formData.get('pluginFile')
    const imageFile = formData.get('imageFile')
    const screenshotFiles = formData.getAll('screenshots').filter(file => file && file.size > 0)
    const removeImage = formData.get('removeImage') === 'true'
    const removeScreenshots = formData.get('removeScreenshots') === 'true'

    if (pluginFile?.size) {
      if (!pluginFile.name.toLowerCase().endsWith(PLUGIN_FILE_EXT)) {
        return bad('Plugin file must be .otzplugin format')
      }
      if (pluginFile.size > MAX_PLUGIN_BYTES) {
        return bad(`Plugin file exceeds ${Math.floor(MAX_PLUGIN_BYTES / 1024 / 1024)}MB limit`)
      }
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

    const isOwnerResubmission = isOwner && !isAdmin
    if (isOwnerResubmission && pluginFile?.size && version === livePlugin.version) {
      return bad('העלית קובץ תוסף חדש. כדי לשמור את השינוי צריך לעדכן גם את מספר הגרסה.')
    }

    const nextPluginData = {
      name,
      shortDescription,
      description,
      version,
      status,
      author,
      compatibleWith,
      tags,
      homepage,
      installInstructions,
      pluginFileName: editableSource.pluginFileName || livePlugin.pluginFileName,
      pluginFileExt: PLUGIN_FILE_EXT,
      pluginFileSize: editableSource.pluginFileSize || livePlugin.pluginFileSize || 0,
      image: editableSource.image ? { ...editableSource.image } : null,
      screenshots: (editableSource.screenshots || []).map((screenshot) => ({ ...screenshot })),
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

    const filesChanged = {
      pluginFile: Boolean(pluginFile?.size),
      image: removeImage || Boolean(imageFile?.size),
      screenshots: removeScreenshots || screenshotFiles.length > 0
    }

    let pendingApproval = false
    let message = 'השינויים נשמרו בהצלחה.'

    if (isOwnerResubmission && plugin.isApproved) {
      const editableChanges = buildChangeSummary(editableSource, nextPluginData, filesChanged)
      if (editableChanges.length === 0 && !hasExplicitFileChanges({
        pluginFile: pluginFile?.size ? pluginFile : null,
        imageFile: imageFile?.size ? imageFile : null,
        screenshotFiles,
        removeImage,
        removeScreenshots
      })) {
        return bad('לא זוהו שינויים לשמירה.')
      }

      const changes = buildChangeSummary(livePlugin, nextPluginData, filesChanged)
      if (changes.length === 0) {
        return bad('לא זוהו שינויים לשמירה.')
      }

      await savePendingSnapshot(plugin._id.toString(), editableSource, nextPluginData, {
        pluginFile: pluginFile?.size ? pluginFile : null,
        imageFile: imageFile?.size ? imageFile : null,
        screenshotFiles,
        removeImage,
        removeScreenshots
      })

      plugin.pendingUpdate = nextPluginData
      plugin.pendingChangeSummary = changes
      plugin.submissionType = 'update'
      plugin.lastSubmittedBy = session.user.id
      plugin.lastSubmittedAt = new Date()
      pendingApproval = true
      message = filesChanged.pluginFile
        ? 'הגרסה החדשה נשמרה ונשלחה לאישור מנהל. בינתיים הגרסה הקיימת ממשיכה להופיע בחנות.'
        : 'השינויים נשמרו ונשלחו לאישור מנהל. בינתיים הגרסה הקיימת ממשיכה להופיע בחנות.'
    } else {
      await saveLiveAssets(plugin._id.toString(), plugin, editableSource, nextPluginData, {
        pluginFile: pluginFile?.size ? pluginFile : null,
        imageFile: imageFile?.size ? imageFile : null,
        screenshotFiles,
        removeImage,
        removeScreenshots
      })

      plugin.name = nextPluginData.name
      plugin.shortDescription = nextPluginData.shortDescription
      plugin.description = nextPluginData.description
      plugin.version = nextPluginData.version
      plugin.status = nextPluginData.status
      plugin.author = nextPluginData.author
      plugin.compatibleWith = nextPluginData.compatibleWith
      plugin.tags = nextPluginData.tags
      plugin.homepage = nextPluginData.homepage
      plugin.installInstructions = nextPluginData.installInstructions
      plugin.pluginFileName = nextPluginData.pluginFileName
      plugin.pluginFileExt = nextPluginData.pluginFileExt
      plugin.pluginFileSize = nextPluginData.pluginFileSize
      plugin.image = nextPluginData.image || { ext: null, contentType: null }
      plugin.screenshots = nextPluginData.screenshots
      plugin.pendingUpdate = null
      plugin.pendingChangeSummary = []
      plugin.lastSubmittedBy = session.user.id
      plugin.lastSubmittedAt = new Date()
      await deletePendingPluginDir(plugin._id.toString()).catch(() => {})

      if (isOwnerResubmission) {
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

    await plugin.save()

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
    console.error('Error updating plugin:', error)
    return bad('Failed to update plugin', 500)
  }
}
