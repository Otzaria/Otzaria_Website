import path from 'path'

export const PLUGIN_LIMITS = {
  name: 100,
  shortDescription: 150,
  description: 10_000,
  version: 30,
  author: 100,
  compatibleWith: 100,
  homepage: 500,
  tag: 40
}

export const ALLOWED_PLUGIN_STATUSES = ['stable', 'beta', 'experimental']
export const PLUGIN_STATUS_LABELS = {
  stable: 'יציב',
  beta: 'בטא',
  experimental: 'ניסיוני'
}
export const PLUGIN_VERSION_RE = /^\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9.]+)?$/
export const MIN_SUPPORTED_APP_VERSION = '0.9.89'

export function formatPluginStatus(status) {
  return PLUGIN_STATUS_LABELS[status] || 'לא ידוע'
}

export function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function parseJsonArrayField(value, fieldName) {
  if (!value) return []
  let parsed
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(`Invalid ${fieldName} format`)
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid ${fieldName} format`)
  }
  return parsed
}

export function normalizeTags(rawTags) {
  return rawTags
    .map(tag => String(tag).trim())
    .filter(Boolean)
    .slice(0, 30)
}

export function assertPluginTextLimits(data) {
  if (data.name.length > PLUGIN_LIMITS.name) {
    throw new Error(`Name must be at most ${PLUGIN_LIMITS.name} characters`)
  }
  if (data.shortDescription.length > PLUGIN_LIMITS.shortDescription) {
    throw new Error(`Short description must be at most ${PLUGIN_LIMITS.shortDescription} characters`)
  }
  if (data.description.length > PLUGIN_LIMITS.description) {
    throw new Error(`Description must be at most ${PLUGIN_LIMITS.description} characters`)
  }
  if (data.version.length > PLUGIN_LIMITS.version) {
    throw new Error(`Version must be at most ${PLUGIN_LIMITS.version} characters`)
  }
  if (data.author.length > PLUGIN_LIMITS.author) {
    throw new Error(`Author must be at most ${PLUGIN_LIMITS.author} characters`)
  }
  if (data.compatibleWith.length > PLUGIN_LIMITS.compatibleWith) {
    throw new Error(`Compatibility must be at most ${PLUGIN_LIMITS.compatibleWith} characters`)
  }
  if ((data.homepage || '').length > PLUGIN_LIMITS.homepage) {
    throw new Error(`Homepage URL must be at most ${PLUGIN_LIMITS.homepage} characters`)
  }
  if ((data.tags || []).some(tag => tag.length > PLUGIN_LIMITS.tag)) {
    throw new Error(`Each tag must be at most ${PLUGIN_LIMITS.tag} characters`)
  }
}

export function getLivePluginData(plugin) {
  return {
    name: plugin.name,
    shortDescription: plugin.shortDescription,
    description: plugin.description,
    version: plugin.version,
    status: plugin.status,
    author: plugin.author,
    compatibleWith: plugin.compatibleWith,
    tags: plugin.tags || [],
    homepage: plugin.homepage || '',
    pluginFileName: plugin.pluginFileName || '',
    pluginFileExt: plugin.pluginFileExt || '.otzplugin',
    pluginFileSize: plugin.pluginFileSize || 0,
    image: plugin.image?.ext ? { ext: plugin.image.ext, contentType: plugin.image.contentType || null } : null,
    screenshots: (plugin.screenshots || []).map((screenshot) => ({
      ext: screenshot.ext,
      contentType: screenshot.contentType || null
    }))
  }
}

export function getEditableSource(plugin) {
  return plugin.pendingUpdate || getLivePluginData(plugin)
}

export function formatPluginForPublic(plugin, options = {}) {
  const pluginId = plugin._id.toString()
  const source = options.usePending ? getEditableSource(plugin) : getLivePluginData(plugin)
  return {
    id: pluginId,
    authorId: plugin.authorId?.toString?.() || plugin.authorId || null,
    name: source.name,
    slug: plugin.slug,
    shortDescription: source.shortDescription,
    description: source.description,
    version: source.version,
    status: source.status,
    author: source.author,
    updatedAt: plugin.updatedAt.toISOString().split('T')[0],
    originalDate: plugin.originalDate || plugin.updatedAt.toISOString().split('T')[0],
    compatibleWith: source.compatibleWith,
    tags: source.tags || [],
    image: source.image?.ext ? `/api/plugins/${pluginId}/image${options.usePending ? '?pending=1' : ''}` : null,
    screenshots: (source.screenshots || []).map((_, index) => `/api/plugins/${pluginId}/screenshots/${index}${options.usePending ? '?pending=1' : ''}`),
    downloadUrl: `/api/plugins/${pluginId}/download`,
    homepage: source.homepage || '',
    downloadCount: plugin.downloadCount || 0,
    supportsDirectInstall: (source.pluginFileExt || '').toLowerCase() === '.otzplugin'
  }
}

export function formatValue(value, field) {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : 'ללא'
  }
  if (value === null || value === undefined || value === '') {
    return 'ללא'
  }
  if (typeof value === 'boolean') {
    return value ? 'כן' : 'לא'
  }
  if (field === 'status') {
    return formatPluginStatus(value)
  }
  return String(value)
}

export function buildChangeSummary(current, next, filesChanged) {
  const fields = [
    ['name', 'שם התוסף'],
    ['shortDescription', 'תיאור קצר'],
    ['description', 'תיאור מלא'],
    ['version', 'גרסה'],
    ['status', 'סטטוס'],
    ['author', 'שם המפתח'],
    ['compatibleWith', 'תאימות'],
    ['tags', 'תגיות'],
    ['homepage', 'אתר בית']
  ]

  const changes = []
  for (const [field, label] of fields) {
    const before = current[field]
    const after = next[field]
    const changed = Array.isArray(before) || Array.isArray(after)
      ? JSON.stringify(before || []) !== JSON.stringify(after || [])
      : String(before ?? '') !== String(after ?? '')

    if (changed) {
      changes.push({
        field,
        label,
        before: formatValue(before, field),
        after: formatValue(after, field)
      })
    }
  }

  if (filesChanged.pluginFile) {
    changes.push({
      field: 'pluginFileName',
      label: 'קובץ התוסף',
      before: current.pluginFileName || 'ללא',
      after: next.pluginFileName || 'ללא'
    })
  }

  if (filesChanged.image) {
    changes.push({
      field: 'image',
      label: 'תמונת תוסף',
      before: current.image ? `קיימת תמונה (${current.image.ext})` : 'ללא תמונה',
      after: next.image ? `קיימת תמונה (${next.image.ext})` : 'ללא תמונה'
    })
  }

  if (filesChanged.screenshots) {
    changes.push({
      field: 'screenshots',
      label: 'צילומי מסך',
      before: `${current.screenshots?.length || 0} קבצים`,
      after: `${next.screenshots?.length || 0} קבצים`
    })
  }

  return changes
}

export function pendingAssetPath(fileName) {
  return path.join('pending', fileName)
}
