import { runPluginValidationJob } from './pluginValidationRunner.js'
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
  validateStartupWhenConditions,
  checkDesignCompliance,
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
  // Keep first-time/offline uploads below the validation slot deadline.
  let timer
  const raw = await Promise.race([
    fetchSpecFromGithub(),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('spec fetch timed out')), 2500) }),
  ]).finally(() => clearTimeout(timer))
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

// Store policy is shared with the upload/edit UI. Heavy work stays in the worker.
export const OTZARIA_DESIGN_TAG = 'מראה תואם לאוצריא'
export { extractZipFiles } from './pluginArchive.js'

export async function validatePluginArchive(buffer) {
  return runPluginValidationJob('validate', buffer, { getSpec: getApiSpec })
}
