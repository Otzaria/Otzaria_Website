import otzariaValidator from 'otzaria-plugin-validator'
import { extractZipFiles, readPluginZipDirectory, parsePluginManifest } from './pluginArchive.js'

const {
  buildManifest, validateManifestFields, validateStartupWhenConditions,
  analyzeApiUsage, checkDesignCompliance, isCodeLikeFile, isStyleLikeFile,
} = otzariaValidator

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
export function validatePluginArchiveCore(buffer, spec) {
  const errors = []
  const warnings = []
  const advisories = []

  const bail = () => ({
    errors,
    warnings,
    advisories,
    design: { compliant: false, violations: [] },
    spec: { source: spec.source, fetchedAt: spec.fetchedAt }
  })

  let files
  let directory
  try {
    directory = readPluginZipDirectory(buffer)
    files = extractZipFiles(buffer, (name) => (
      name === 'manifest.json' || isCodeLikeFile(name) || isStyleLikeFile(name)
    ), directory)
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
    manifest = parsePluginManifest(manifestBuf)
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

  // Existence checks use ZIP metadata, never a second inflation of every asset.
  const entrypoint = (manifest.entrypoint || '').toString()
  const hasFile = (name) => directory.entries.has(name) && !name.endsWith('/')
  if (entrypoint && !hasFile(entrypoint)) {
    errors.push(`Entrypoint שצוין ב-manifest ("${entrypoint}") לא נמצא בקובץ התוסף`)
  }
  const backgroundEntrypoint = (manifest.contributes?.background?.entrypoint || '').toString()
  if (backgroundEntrypoint && !hasFile(backgroundEntrypoint)) {
    errors.push(`קובץ הרקע שצוין ב-manifest ("${backgroundEntrypoint}") לא נמצא בקובץ התוסף`)
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
