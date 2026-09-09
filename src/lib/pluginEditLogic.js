import { ALLOWED_PLUGIN_STATUSES, MIN_SUPPORTED_APP_VERSION, PLUGIN_VERSION_RE, formatPluginForPublic } from '@/lib/pluginSubmission'
import { compareVersions } from '@/lib/pluginManifest'

// לוגיקה טהורה עבור src/app/api/admin/plugins/[id]/edit/route.js — ולידציית
// שדות הטופס, בניית תשובת ה-GET ומודל ההחלטה של תגית "מראה תואם לאוצריא".
// כל מה שתלוי ב-request/response, DB או קריאת/כתיבת קבצים נשאר בראוט עצמו.

export function getAssetSources(source) {
  return {
    pluginFile: source.assetSources?.pluginFile || 'live',
    image: source.assetSources?.image || (source.image ? 'live' : 'none'),
    screenshots: source.assetSources?.screenshots || ((source.screenshots || []).length ? 'live' : 'none')
  }
}

export function buildEditResponse(plugin, source) {
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

// ולידציית שדות הטופס הבסיסיים לפני כל עיבוד נוסף (מזהה קובץ/מניפסט וכו').
// מחזירה הודעת שגיאה (string) שראוי להחזיר עם סטטוס 400, או null אם תקין.
export function validateBasicEditFields({
  name,
  shortDescription,
  description,
  version,
  author,
  compatibleWith,
  status,
  maxAppVersion,
  liveVersion
}) {
  if (!name || !shortDescription || !description || !version || !author || !compatibleWith) {
    return 'Missing required fields'
  }
  if (!ALLOWED_PLUGIN_STATUSES.includes(status)) {
    return `Status must be one of: ${ALLOWED_PLUGIN_STATUSES.join(', ')}`
  }
  // הטופס מגיש את הגרסה החיה מה-DB גם כשלא נגעו בה. תוסף שפורסם בגרסה ישנה
  // ("1.0", "1.0.0.1") נחסם כאן מכל עריכת מטא-דאטה, ולכן אוכפים רק על גרסה חדשה.
  if (version !== liveVersion && !PLUGIN_VERSION_RE.test(version)) {
    return 'Version must be in the form X.Y.Z'
  }
  if (maxAppVersion) {
    if (!PLUGIN_VERSION_RE.test(maxAppVersion)) {
      return 'שדה maxAppVersion אינו בפורמט גרסה תקין'
    }
    if (compareVersions(maxAppVersion, compatibleWith) < 0) {
      return `גרסת המקסימום (${maxAppVersion}) לא יכולה להיות נמוכה מגרסת המינימום (${compatibleWith})`
    }
  }
  return null
}

// מודל ההחלטה של תגית "מראה תואם לאוצריא" בהינתן מצב עמידה בעיצוב שכבר חושב
// (designCompliant) ורצון המשתמש (userRequestedDesignTag) — בלי כל I/O. אם
// בקשה חסומה (רצו את התגית בלי עמידה בעיצוב) מוחזרת הודעת שגיאה; אחרת
// מוחזרת רשימת התגיות המעודכנת.
export function resolveDesignTagDecision({ tags, designTag, designCompliant, userRequestedDesignTag, designViolations }) {
  if (userRequestedDesignTag && !designCompliant) {
    const detail = (designViolations || []).length > 0
      ? `\n- ${designViolations.join('\n- ')}`
      : ''
    return {
      error: `לא ניתן להוסיף את התגית "${designTag}" — העיצוב אינו תואם ל-DESIGN_GUIDE.md:${detail}`,
      tags
    }
  }
  if (designCompliant && !userRequestedDesignTag) {
    return { error: null, tags: [...tags, designTag] }
  }
  if (!designCompliant && userRequestedDesignTag) {
    // הגנת בטחון - לא אמור להגיע לכאן כי נחסם למעלה.
    return { error: null, tags: tags.filter((tag) => tag !== designTag) }
  }
  return { error: null, tags }
}

// חילוץ ואימות שדות המטא-דאטה הנגזרים מ-manifest.json כשיוצר (לא מנהל) מחליף
// קובץ תוסף. מחזירה { error } עם הודעה מתאימה לסטטוס 400, או את שדות המטא-דאטה
// הנגזרים כשהכל תקין.
export function deriveOwnerFieldsFromManifest(manifest) {
  // ברירת מחדל זהה לאוצריא ולוולידטור ה-CI — ראו upload/route.js.
  const manifestStability = (manifest.stability || 'stable').toString().trim()
  if (!ALLOWED_PLUGIN_STATUSES.includes(manifestStability)) {
    return { error: 'ערך stability לא תקין ב-manifest.json (ערכים מותרים: stable, beta, experimental)' }
  }
  const manifestMinAppVersion = manifest.minAppVersion ? manifest.minAppVersion.toString().trim() : ''
  if (!manifestMinAppVersion) {
    return { error: 'חסר שדה minAppVersion ב-manifest.json של קובץ התוסף' }
  }
  if (compareVersions(manifestMinAppVersion, MIN_SUPPORTED_APP_VERSION) < 0) {
    return { error: `גרסת המינימום (${manifestMinAppVersion}) לא יכולה להיות פחות מ-${MIN_SUPPORTED_APP_VERSION}` }
  }
  const manifestName = (manifest.name || '').toString().trim()
  const manifestAuthor = (manifest.author || '').toString().trim()
  const manifestDesc = (manifest.description || '').toString().trim()
  const manifestMaxAppVersion = manifest.maxAppVersion ? manifest.maxAppVersion.toString().trim() : ''
  if (manifestMaxAppVersion) {
    if (!PLUGIN_VERSION_RE.test(manifestMaxAppVersion)) {
      return { error: 'שדה maxAppVersion ב-manifest.json אינו בפורמט גרסה תקין' }
    }
    if (compareVersions(manifestMaxAppVersion, manifestMinAppVersion) < 0) {
      return { error: `גרסת המקסימום (${manifestMaxAppVersion}) לא יכולה להיות נמוכה מגרסת המינימום (${manifestMinAppVersion})` }
    }
  }

  return {
    error: null,
    status: manifestStability,
    compatibleWith: manifestMinAppVersion,
    maxAppVersion: manifestMaxAppVersion || null,
    homepage: manifest.homepage ? manifest.homepage.toString().trim() : '',
    requiresNetwork: manifest.network?.enabled === true,
    ...(manifestName ? { name: manifestName } : {}),
    ...(manifestAuthor ? { author: manifestAuthor } : {}),
    ...(manifestDesc ? { shortDescription: manifestDesc } : {})
  }
}
