import { unzipSync } from 'fflate'
import otzariaValidator from 'otzaria-plugin-validator'

// --- מקורות הסמכות -----------------------------------------------------------
// נתונים  — spec.json, מחולל בריפו של אוצריא מקבועי הקוד
//           (tool/plugins/generate_plugin_spec.dart) ומצורף בתוך החבילה.
// לוגיקה  — חבילת otzaria-plugin-validator: תאימות למפרט (מתודות, הרשאות,
//           תנאי when, מדיניות ההגדרות, סריקת קוד, תאימות עיצוב). מוצמדת
//           ל-#v1 ומתרעננת בכל בנייה, ולכן כלל חדש בוולידטור מגיע לחנות מיד.
// מדיניות — הקובץ הזה: מה החנות חוסמת עליו וברמת חומרה איזו. ולידציית המפרט
//           אינה יודעת דבר על החנות, והחנות אינה משכפלת את כללי המפרט.

const {
  SPEC: PLUGIN_SDK_SPEC,
  getApiSpec: fetchSpecFromGithub,
  buildFallbackSpec,
  mergeWithFallback,
  buildManifest,
  validateManifestFields,
  validateStartupWhenConditions,
  analyzeApiUsage,
  checkDesignCompliance,
  isCodeLikeFile,
  isStyleLikeFile,
} = otzariaValidator

export { checkDesignCompliance, validateStartupWhenConditions }

const SUPPORTED_SPEC_SCHEMA = 1
if (PLUGIN_SDK_SPEC.schemaVersion !== SUPPORTED_SPEC_SCHEMA) {
  throw new Error(
    `otzaria-plugin-validator spec schemaVersion ${PLUGIN_SDK_SPEC.schemaVersion} אינו נתמך ` +
    `(מצופה ${SUPPORTED_SPEC_SCHEMA})`
  )
}

export { PLUGIN_SDK_SPEC }

// hosts חשופים (ללא סכימה) שמותרים ב-network.allowlist.
// שיקוף של _loopbackHosts ב-lib/plugins/models/plugin_network_allowlist.dart.
const LOOPBACK_ALLOWLIST_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

// כללי המניפסט שהחנות חוסמת עליהם. שאר הכללים ב-MANIFEST_RULES (id, version,
// stability, databaseSources, toolTab.iconName) נאכפים ב-CI של התוסף ובאריזה
// באוצריא — הרחבתם לחנות היא החלטת מדיניות, לא רפקטור.
const STORE_MANIFEST_RULES = [
  'schemaVersion',
  'name',
  'description',
  'toolTabTitle',
  'permissions',
]

const CACHE_TTL_MS = 4 * 60 * 60 * 1000      // 4 hours on success
const FAILURE_TTL_MS = 5 * 60 * 1000         // 5 minutes after a failed fetch

// העותק המצורף בחבילה — משטח מלא, ולא קירוב ידני. source נשאר 'fallback'
// כדי שלוגיקת המטמון לא תתבלבל בינו ובין מפרט שנטען מהרשת.
function vendoredSpec() {
  const spec = mergeWithFallback(buildFallbackSpec())
  spec.source = 'fallback'
  spec.fetchedAt = new Date().toISOString()
  return spec
}

// מפרט חי: אותו קובץ spec.json שהעותק המצורף נגזר ממנו. החבילה בולעת כשלי
// רשת ומחזירה את העותק המצורף, ולכן נכשלים כאן במפורש כדי שהמטמון יקצר את
// תוחלת החיים ויינסה שוב בקרוב.
async function fetchApiSpec() {
  const raw = await fetchSpecFromGithub()
  if (raw.source !== 'remote') throw new Error(raw.error || 'spec fetch failed')
  const spec = mergeWithFallback(raw)
  spec.fetchedAt = new Date().toISOString()
  return spec
}

let cache = null
let cacheExpiresAt = 0
let inFlight = null

export async function getApiSpec() {
  const now = Date.now()
  if (cache && now < cacheExpiresAt) return cache
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const fresh = await fetchApiSpec()
      cache = fresh
      cacheExpiresAt = Date.now() + CACHE_TTL_MS
      return fresh
    } catch (err) {
      console.warn('[pluginValidation] Failed to refresh the SDK spec, using the vendored copy:', err?.message)
      if (!cache || cache.source !== 'remote') {
        cache = vendoredSpec()
      }
      cacheExpiresAt = Date.now() + FAILURE_TTL_MS
      return cache
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

// בדיקות חיצוניות שעוטפות לבדיקה - שימושי לבדיקות
export function _resetApiSpecCacheForTests() {
  cache = null
  cacheExpiresAt = 0
  inFlight = null
}

// --- ZIP extraction ----------------------------------------------------------

/**
 * Extract files from an .otzplugin ZIP buffer using fflate (the same library
 * the upload UI uses on the client). Optional predicate filters which entries
 * to inflate, saving CPU on large archives.
 * Returns Map<filename, Buffer>.
 */
export function extractZipFiles(buffer, predicate) {
  const bytes = buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array(buffer)
  let unzipped
  try {
    unzipped = unzipSync(bytes, predicate
      ? { filter: (file) => !file.name.endsWith('/') && predicate(file.name) }
      : undefined)
  } catch (err) {
    throw new Error(`Not a valid ZIP file: ${err.message}`)
  }
  const files = new Map()
  for (const [name, data] of Object.entries(unzipped)) {
    if (name.endsWith('/')) continue
    files.set(name, Buffer.from(data.buffer, data.byteOffset, data.byteLength))
  }
  return files
}

// --- Store policy ------------------------------------------------------------

// תגית שמתווספת אוטומטית כאשר העיצוב תואם לתיעוד. אסור להגדיר ידנית.
export const OTZARIA_DESIGN_TAG = 'מראה תואם לאוצריא'

// --- Public entry point ------------------------------------------------------

/**
 * Validate a plugin archive (.otzplugin ZIP) against the official Otzaria SDK spec.
 *
 * שלוש רמות ממצא:
 *   errors    — פוסל.
 *   warnings  — פוסל גם הוא (מדיניות החנות: לא מאחסנים תוסף שאינו תואם ל-SDK).
 *   advisories — המלצת ניקיון בלבד. אינו פוסל, כי אין בו אי-תאימות: המצב
 *               שהוא מתאר תקין ועובד, ורק אפשר לנסח אותו יפה יותר.
 *
 * @param {Buffer} buffer - the plugin file as Buffer
 * @returns {Promise<{errors: string[], warnings: string[], advisories: string[], spec: {source: string, fetchedAt: string}}>}
 */
export async function validatePluginArchive(buffer) {
  const errors = []
  const warnings = []
  const advisories = []

  let spec
  try {
    spec = await getApiSpec()
  } catch {
    spec = vendoredSpec()
  }

  const bail = () => ({
    errors,
    warnings,
    advisories,
    design: { compliant: false, violations: [] },
    spec: { source: spec.source, fetchedAt: spec.fetchedAt }
  })

  let files
  try {
    files = extractZipFiles(buffer, (name) =>
      name === 'manifest.json' || isCodeLikeFile(name) || isStyleLikeFile(name)
    )
  } catch (err) {
    errors.push(`לא ניתן לקרוא את קובץ ה-ZIP של התוסף: ${err.message}`)
    return bail()
  }

  // ---- Manifest ----
  const manifestBuf = files.get('manifest.json')
  if (!manifestBuf) {
    errors.push('manifest.json לא נמצא בקובץ התוסף')
    return bail()
  }
  let manifest
  try {
    // עורכים בווינדוז שומרים לעיתים JSON עם BOM (U+FEFF) בתחילת הקובץ. JSON.parse לא יודע להתמודד.
    manifest = JSON.parse(manifestBuf.toString('utf8').replace(/^﻿/, ''))
  } catch (err) {
    errors.push(`manifest.json אינו JSON תקין: ${err.message}`)
    return bail()
  }

  // מניפסט שהחנות בודקת שדה-שדה, ולכן lenient: שדה חסר לא מפיל את כל הקריאה.
  const normalized = buildManifest(manifest, { lenient: true })
  const declaredSet = new Set(normalized.permissions)

  // צורת השדה permissions — כלל מקומי לחנות, לפני שהמפרט נכנס לתמונה.
  if (manifest.permissions !== undefined && !Array.isArray(manifest.permissions)) {
    errors.push('השדה permissions ב-manifest חייב להיות מערך של מחרוזות')
  }
  if (Array.isArray(manifest.permissions)) {
    for (const perm of manifest.permissions) {
      if (typeof perm !== 'string') {
        errors.push(`הרשאה לא תקינה ב-manifest (לא מחרוזת): ${JSON.stringify(perm)}`)
      }
    }
  }

  errors.push(...validateManifestFields({
    manifest: normalized,
    validPermissions: spec.permissions,
    methodPermissions: spec.methodPermissions,
    rules: STORE_MANIFEST_RULES,
  }))

  // network.allowlist - אם הוכרז network.enabled=true או הרשאת network.access, חובה allowlist
  const networkRequested =
    manifest.network?.enabled === true ||
    declaredSet.has('network.access')
  if (networkRequested) {
    const allowlist = manifest.network?.allowlist
    if (!Array.isArray(allowlist) || allowlist.length === 0) {
      errors.push('network.access דורש manifest.network.allowlist עם רשימת כתובות מפורשת (ללא wildcards)')
    } else {
      for (const url of allowlist) {
        // host מקומי חשוף הוא ערך שאוצריא עצמה מקבלת (isLoopbackHost ב-
        // plugin_network_allowlist.dart) — דחייה כאן הייתה פוסלת תוסף שמותקן בפועל.
        if (typeof url === 'string' && LOOPBACK_ALLOWLIST_HOSTS.has(url.trim().toLowerCase())) continue
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
          errors.push(`כתובת לא תקינה ב-network.allowlist: ${JSON.stringify(url)} (חובה http(s) URL מלא, או host מקומי כמו 127.0.0.1)`)
        } else if (url.includes('*')) {
          errors.push(`network.allowlist אינו תומך ב-wildcard: ${url}`)
        }
      }
    }
  }

  // entrypoint - הקובץ אמור להיות חלק מה-ZIP
  const entrypoint = (manifest.entrypoint || '').toString()
  if (entrypoint) {
    if (!files.has(entrypoint)) {
      // יתכן שלא חולץ - ננסה שוב ללא predicate כדי לוודא
      const allFiles = extractZipFiles(buffer)
      if (!allFiles.has(entrypoint)) {
        errors.push(`Entrypoint שצוין ב-manifest ("${entrypoint}") לא נמצא בקובץ התוסף`)
      }
    }
  }

  // contributes.background.entrypoint - קובץ הרקע הקליל (אם הוכרז) חייב גם הוא
  // להיכלל ב-ZIP, אחרת תוסף הרקע יישבר בשקט בעליית אוצריא.
  const backgroundEntrypoint = (manifest.contributes?.background?.entrypoint || '').toString()
  if (backgroundEntrypoint) {
    if (!files.has(backgroundEntrypoint)) {
      const allFiles = extractZipFiles(buffer)
      if (!allFiles.has(backgroundEntrypoint)) {
        errors.push(`קובץ הרקע שצוין ב-manifest ("${backgroundEntrypoint}") לא נמצא בקובץ התוסף`)
      }
    }
  }

  // ---- contributes.startup: תנאי when ----
  errors.push(...validateStartupWhenConditions(manifest))

  // ---- Code scan + cross-checks ----
  // הממצאים חוזרים מקובצים לפי סוג וללא חומרה, והחנות היא שקובעת אותה: הצהרה
  // על הרשאת בסיס היא advisory ולא warning, כי נתיבי ההעלאה והעריכה פוסלים על
  // כל אזהרה — וכאזהרה היא חסמה כל עדכון של כל תוסף שמצהיר הרשאת בסיס.
  const usage = analyzeApiUsage({ manifest: normalized, files, spec })
  for (const finding of usage.unknownMethods) warnings.push(finding.message)
  for (const finding of usage.unknownEvents) warnings.push(finding.message)
  for (const finding of usage.missingPermissions) warnings.push(finding.message)
  for (const finding of usage.baselinePermissions) advisories.push(finding.message)
  for (const finding of usage.permissionVersionErrors) errors.push(finding.message)
  for (const finding of usage.methodVersionErrors) errors.push(finding.message)
  for (const finding of usage.missingEventPermissions) warnings.push(finding.message)

  // ---- Design compliance ----
  let design = { compliant: false, violations: [] }
  try {
    design = checkDesignCompliance(files)
  } catch (designErr) {
    console.warn('[pluginValidation] design compliance scan failed:', designErr?.message)
  }

  return {
    errors,
    warnings,
    advisories,
    design,
    usedApiMethods: [...usage.apiUsage.keys()],
    spec: { source: spec.source, fetchedAt: spec.fetchedAt }
  }
}
