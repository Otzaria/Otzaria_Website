import { inflateRawSync } from 'zlib'

// --- Fallback snapshot of the official Otzaria plugin SDK API_REFERENCE.md ----
// כשה-fetch מ-GitHub נכשל מסתמכים על הרשימות הללו. יש לעדכן בעת שינוי בתיעוד הרשמי.
// https://github.com/Otzaria/otzaria/blob/dev/docs/plugin-sdk/API_REFERENCE.md

const FALLBACK_PERMISSIONS = [
  'app.info.read',
  'app.user_email.read',
  'library.books.read',
  'library.content.read',
  'search.fulltext.read',
  'reader.open',
  'reader.context_menu',
  'reader.highlight',
  'navigation.write',
  'notes.read',
  'notes.write',
  'calendar.read',
  'settings.read',
  'ui.feedback',
  'plugin.storage.read',
  'plugin.storage.write',
  'published_data.write',
  'network.access',
  'feedback.send_email',
  'history.read',
  'history.write',
  'notifications.send',
  'notifications.system',
  'database.read',
  'events.subscribe:navigation.changed',
  'events.subscribe:reader.current_book_changed',
  'events.subscribe:reader.current_ref_changed',
  'events.subscribe:reader.selection_changed',
  'events.subscribe:theme.changed',
  'events.subscribe:settings.changed',
  'events.subscribe:calendar.date_changed',
  'events.subscribe:workspace.changed',
  'events.subscribe:plugin.permissions_changed'
]

const FALLBACK_API_METHODS = [
  'app.getInfo', 'app.getTheme', 'app.getLocale', 'app.getUserEmail', 'app.getGrantedPermissions',
  'library.findBooks', 'library.getBookMetadata', 'library.listRecentBooks',
  'library.getBookContent', 'library.getBookToc',
  'search.fullText',
  'reader.openBook', 'reader.openBookAtRef', 'reader.getCurrentState', 'reader.getCurrentRef',
  'reader.getSelection', 'reader.addContextMenuItem', 'reader.removeContextMenuItem',
  'reader.setHighlight', 'reader.getHighlights', 'reader.clearHighlight', 'reader.clearAllHighlights',
  'navigation.goTo',
  'notes.list', 'notes.getBookNotesSummary', 'notes.add', 'notes.update', 'notes.delete',
  'ui.showMessage', 'ui.showSuccess', 'ui.showError', 'ui.showConfirm', 'ui.showWarning',
  'feedback.sendEmail',
  'history.list', 'history.listSearches', 'history.clear', 'history.remove',
  'notifications.showInApp', 'notifications.sendSystem', 'notifications.scheduleSystem',
  'notifications.cancel', 'notifications.cancelAll', 'notifications.checkPermissions',
  'notifications.requestPermissions',
  'storage.get', 'storage.set', 'storage.remove', 'storage.list',
  'settings.get', 'settings.getMany',
  'calendar.getSelectedDate', 'calendar.getDailyTimes', 'calendar.getHalachicTimes',
  'calendar.getJewishDate', 'calendar.getEvents',
  'publishedData.upsert', 'publishedData.remove', 'publishedData.listOwn',
  'database.listSources', 'database.describeSource', 'database.query', 'database.batchQuery'
]

const FALLBACK_EVENTS = [
  'plugin.boot', 'plugin.ready',
  'theme.changed',
  'navigation.changed',
  'reader.current_book_changed', 'reader.current_ref_changed',
  'reader.selection_changed', 'reader.context_menu_item_clicked',
  'calendar.date_changed', 'workspace.changed',
  'settings.changed', 'plugin.permissions_changed'
]

// APIs שמופיעות בתוספים קיימים אך אינן מתועדות במסמך הציבורי. לא נצעק עליהן.
const KNOWN_UNDOCUMENTED_METHODS = new Set([
  'network.fetch',
  'plugin.listInstalled',
  'plugin.requestInstall',
  'plugin.uninstall'
])

const API_REFERENCE_URL =
  'https://raw.githubusercontent.com/Otzaria/otzaria/dev/docs/plugin-sdk/API_REFERENCE.md'
const CACHE_TTL_MS = 4 * 60 * 60 * 1000      // 4 hours on success
const FAILURE_TTL_MS = 5 * 60 * 1000         // 5 minutes after a failed fetch
const FETCH_TIMEOUT_MS = 15_000

function buildFallbackSpec() {
  return {
    permissions: new Set(FALLBACK_PERMISSIONS),
    apiMethods: new Set(FALLBACK_API_METHODS),
    events: new Set(FALLBACK_EVENTS),
    source: 'fallback',
    fetchedAt: new Date().toISOString()
  }
}

function looksLikePermission(token) {
  // הרשאות ב-snake_case מנוקדות, ללא camelCase. למשל: library.books.read, plugin.storage.write.
  if (token.startsWith('events.subscribe:')) {
    const tail = token.slice('events.subscribe:'.length)
    return /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/.test(tail)
  }
  if (!/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/.test(token)) return false
  if (/[A-Z]/.test(token)) return false
  // לסנן ערכי דמה כמו "event.name", "namespace.method"
  if (/^(event|namespace|plugin)\.(name|method|id)$/.test(token)) return false
  return true
}

function parseApiReferenceMarkdown(md) {
  const permissions = new Set()
  const apiMethods = new Set()
  const events = new Set()

  // 1. הרשאות events.subscribe נראות ישירות במחרוזת. תופסים את כולן.
  let match
  const subRe = /events\.subscribe:[a-z][a-zA-Z0-9_.]+/g
  while ((match = subRe.exec(md)) !== null) permissions.add(match[0])

  // 2. הרשאות סטנדרטיות מופיעות כ-inline code (backticked) במשפטים כמו
  //    **הרשאה נדרשת:** `library.books.read`. נסרוק את כל ה-inline-code,
  //    ונשמור רק את אלה שנראות כמו הרשאה.
  const inlineRe = /`([a-z][a-zA-Z0-9_.:]+)`/g
  while ((match = inlineRe.exec(md)) !== null) {
    if (looksLikePermission(match[1])) permissions.add(match[1])
  }

  // 3. שיטות ה-API חיות בכותרות מסוג `### \`namespace.method\`` ובדוגמאות
  //    `Otzaria.call('namespace.method', …)`. שתי מקורות עצמאיים — נצרף את שניהם.
  const headingRe = /^###\s+`([a-z][a-zA-Z0-9_]*\.[a-zA-Z0-9_]+)`/gm
  while ((match = headingRe.exec(md)) !== null) apiMethods.add(match[1])
  const callRe = /Otzaria\.call\(['"]([a-z][a-zA-Z0-9_]*\.[a-zA-Z0-9_]+)['"]/g
  while ((match = callRe.exec(md)) !== null) {
    // נדלג על placeholder-ים מכוונים
    if (match[1] === 'namespace.method') continue
    apiMethods.add(match[1])
  }

  // 4. אירועים: מצטטים ב-Otzaria.on('…'), ואז סוננים placeholders.
  const onRe = /Otzaria\.on\(['"]([a-z][a-zA-Z0-9_]*\.[a-zA-Z0-9_]+)['"]/g
  while ((match = onRe.exec(md)) !== null) {
    if (match[1] === 'event.name') continue
    events.add(match[1])
  }
  // כל הרשאת events.subscribe:X מרמזת על קיום event בשם X
  for (const perm of permissions) {
    if (perm.startsWith('events.subscribe:')) {
      events.add(perm.slice('events.subscribe:'.length))
    }
  }
  // ארועי lifecycle אינם תמיד מצוטטים. נשמור על הוספתם אם הופיעו במסמך.
  for (const lifecycle of ['plugin.boot', 'plugin.ready']) {
    if (md.includes(lifecycle)) events.add(lifecycle)
  }

  if (permissions.size < 5 || apiMethods.size < 10) {
    throw new Error('Parsed API reference looked malformed')
  }

  return {
    permissions,
    apiMethods,
    events: events.size > 0 ? events : new Set(FALLBACK_EVENTS),
    source: 'remote',
    fetchedAt: new Date().toISOString()
  }
}

async function fetchApiSpec() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(API_REFERENCE_URL, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'otzaria-website-plugin-validator' }
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    return parseApiReferenceMarkdown(text)
  } finally {
    clearTimeout(timer)
  }
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
      console.warn('[pluginValidation] Failed to refresh API reference, using fallback:', err?.message)
      if (!cache || cache.source !== 'remote') {
        cache = buildFallbackSpec()
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

// --- ZIP extraction (central-directory based, supports stored + deflate) -----

/**
 * Extract files from an .otzplugin ZIP buffer.
 * Returns Map<filename, Buffer>. Optional predicate filters which entries to inflate.
 */
export function extractZipFiles(buffer, predicate) {
  const files = new Map()
  let eocdOffset = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break }
  }
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file')
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16)
  const cdEntries = buffer.readUInt16LE(eocdOffset + 10)
  let cdPos = cdOffset
  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(cdPos) !== 0x02014b50) break
    const compressionMethod = buffer.readUInt16LE(cdPos + 10)
    const compressedSize = buffer.readUInt32LE(cdPos + 20)
    const fileNameLength = buffer.readUInt16LE(cdPos + 28)
    const extraFieldLength = buffer.readUInt16LE(cdPos + 30)
    const commentLength = buffer.readUInt16LE(cdPos + 32)
    const localHeaderOffset = buffer.readUInt32LE(cdPos + 42)
    const fileName = buffer.toString('utf8', cdPos + 46, cdPos + 46 + fileNameLength)
    cdPos += 46 + fileNameLength + extraFieldLength + commentLength
    if (fileName.endsWith('/')) continue
    if (predicate && !predicate(fileName)) continue
    const localFnLen = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localFnLen + localExtraLen
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize)
    let data
    if (compressionMethod === 0) {
      data = compressedData
    } else if (compressionMethod === 8) {
      try {
        data = inflateRawSync(compressedData)
      } catch {
        continue
      }
    } else {
      continue // skip unsupported compression
    }
    files.set(fileName, data)
  }
  return files
}

// --- Plugin source scanning --------------------------------------------------

const CODE_FILE_RE = /\.(?:js|mjs|cjs|html?|vue|svelte)$/i
const STYLE_FILE_RE = /\.(?:css|html?)$/i

function isCodeLikeFile(name) {
  return CODE_FILE_RE.test(name)
}

function isStyleLikeFile(name) {
  return STYLE_FILE_RE.test(name)
}

// --- Design compliance check (DESIGN_GUIDE.md) -------------------------------

// תגית שמתווספת אוטומטית כאשר העיצוב תואם לתיעוד. אסור להגדיר ידנית.
export const OTZARIA_DESIGN_TAG = 'מראה תואם לאוצריא'

// צבעים בעלי משמעות מיוחדת ב-CSS שאינם "באמת" צבעים קבועים — מותרים.
const ALLOWED_COLOR_KEYWORDS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'currentcolor', 'transparent', 'none'
])

const NAMED_COLOR_RE = /\b(black|white|red|green|blue|yellow|gray|grey|purple|orange|pink|brown|cyan|magenta|silver|gold|maroon|navy|teal|olive|aqua|fuchsia|lime|violet|indigo|coral|crimson|salmon|khaki|beige|ivory|wheat|tan|chocolate|tomato|turquoise|orchid)\b/i
const HEX_COLOR_RE = /#[0-9a-fA-F]{3,8}\b/g
const RGB_HSL_RE = /\b(?:rgb|rgba|hsl|hsla)\s*\(/g
// CSS properties שצובעים ולכן ערכים בתוכם נבדקים
const COLOR_PROP_RE = /(?:^|[\s;{])(color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke)\s*:\s*([^;}]+)/gi

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * סורק קוד CSS/HTML ומחזיר רשימת חריגות לעומת DESIGN_GUIDE.md.
 * מחזיר { compliant: boolean, violations: string[] }.
 * אם אין קבצים שיש מה לבדוק בהם — לא compliant (לא ניתן להעיד על תאימות).
 */
export function checkDesignCompliance(files) {
  const violations = []
  const cssChunks = []
  let sawAnyHtml = false
  let sawAnyCss = false

  for (const [name, buf] of files) {
    if (/\.css$/i.test(name)) {
      sawAnyCss = true
      cssChunks.push({ name, css: buf.toString('utf8') })
    } else if (/\.html?$/i.test(name)) {
      sawAnyHtml = true
      const html = buf.toString('utf8')

      const rootMatch = html.match(/<html\b([^>]*)>/i)
      if (rootMatch) {
        const attrs = rootMatch[1]
        if (!/\bdir\s*=\s*['"]\s*rtl\s*['"]/i.test(attrs)) {
          violations.push(`${name}: תג <html> חייב לכלול dir="rtl"`)
        }
        if (!/\blang\s*=\s*['"]\s*he\s*['"]/i.test(attrs)) {
          violations.push(`${name}: תג <html> חייב לכלול lang="he"`)
        }
      }

      const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi
      let m
      while ((m = styleRe.exec(html)) !== null) {
        cssChunks.push({ name: `${name} (<style>)`, css: m[1] })
      }
    }
  }

  // תוסף ללא HTML וללא CSS לא יכול להיות "מראה תואם" — אין מה למדוד.
  if (!sawAnyHtml && !sawAnyCss) {
    return {
      compliant: false,
      violations: ['לא נמצאו קבצי HTML/CSS שניתן לבדוק את תאימות העיצוב שלהם']
    }
  }

  for (const { name, css } of cssChunks) {
    const stripped = stripCssComments(css)
    const seenViolationTypes = new Set()
    const addOnce = (type, message) => {
      if (seenViolationTypes.has(type)) return
      seenViolationTypes.add(type)
      violations.push(message)
    }

    // 1. צבעי hex מקודדים
    const hexMatches = stripped.match(HEX_COLOR_RE) || []
    if (hexMatches.length > 0) {
      const sample = [...new Set(hexMatches)].slice(0, 3).join(', ')
      addOnce('hex', `${name}: צבעי hex מקודדים (${sample}). חובה var(--color-*)`)
    }

    // 2. ערכי rgb/hsl
    if (RGB_HSL_RE.test(stripped)) {
      RGB_HSL_RE.lastIndex = 0
      addOnce('rgb', `${name}: ערכי rgb()/rgba()/hsl()/hsla() מקודדים. חובה var(--color-*)`)
    }

    // 3. שמות צבעים באנגלית בתוך color/background/border/outline/fill/stroke
    COLOR_PROP_RE.lastIndex = 0
    let propMatch
    while ((propMatch = COLOR_PROP_RE.exec(stripped)) !== null) {
      const value = propMatch[2].trim()
      // לדלג על ערכים שמשתמשים ב-var()
      if (/var\s*\(/.test(value)) continue
      // לדלג על מילות מפתח לגיטימיות
      const firstToken = value.split(/[\s,]/)[0].toLowerCase()
      if (ALLOWED_COLOR_KEYWORDS.has(firstToken)) continue
      // לדלג אם זה רק מספר (border: 1px solid var(...))
      if (/^[\d.]+(px|em|rem|%)?$/.test(firstToken)) continue
      // לדלג על "solid"/"dashed" וכו' (border-style ב-shorthand)
      if (/^(?:solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden)$/.test(firstToken)) {
        // הערך עצמו עשוי להכיל שם צבע אחר — להמשיך בדיקה
      }
      if (NAMED_COLOR_RE.test(value)) {
        addOnce('named', `${name}: שם צבע באנגלית בערך CSS ("${value.slice(0, 40)}"). חובה var(--color-*)`)
        break
      }
    }

    // 4. font-family שאינו var(--font-*)
    const fontFamRe = /font-family\s*:\s*([^;}]+)/gi
    let fmMatch
    while ((fmMatch = fontFamRe.exec(stripped)) !== null) {
      const value = fmMatch[1].trim()
      if (!/var\s*\(\s*--font/i.test(value)) {
        addOnce('font-family', `${name}: font-family מקודד ("${value.slice(0, 50)}"). חובה var(--font-main)`)
        break
      }
    }

    // 5. font-size בערכי px קבועים
    const fontSizeRe = /font-size\s*:\s*([^;}]+)/gi
    let fsMatch
    while ((fsMatch = fontSizeRe.exec(stripped)) !== null) {
      const value = fsMatch[1].trim()
      // מותר: var(...), אחוזים, em/rem
      if (/var\s*\(/.test(value)) continue
      if (/^\d+(?:\.\d+)?\s*(?:em|rem|%)$/i.test(value)) continue
      if (/^0(?:px)?$/.test(value)) continue
      if (/\d+\s*px/i.test(value)) {
        addOnce('font-size-px', `${name}: font-size ב-px קבוע ("${value.slice(0, 30)}"). חובה em/rem או var(--font-size-base)`)
        break
      }
    }

    // 6. border-radius בערכי px ארביטררים (לא 0, לא var)
    const radiusRe = /border-radius\s*:\s*([^;}]+)/gi
    let brMatch
    while ((brMatch = radiusRe.exec(stripped)) !== null) {
      const value = brMatch[1].trim()
      if (/var\s*\(/.test(value)) continue
      if (/^0(?:px)?(?:\s+0(?:px)?)*$/.test(value)) continue
      if (/^\d+(?:\.\d+)?\s*%$/.test(value)) continue
      if (/\d+\s*px/i.test(value)) {
        addOnce('radius-px', `${name}: border-radius ב-px קבוע ("${value.slice(0, 30)}"). חובה var(--radius-sm/md/lg/pill)`)
        break
      }
    }
  }

  // נדרש שהתוסף יקרא לתבניות צבע של אוצריא — אם אין שום שימוש ב-var(--color-*) באף קובץ,
  // קשה להאמין שהוא באמת מציית למערכת הצבעים.
  const usesColorVar = cssChunks.some(({ css }) => /var\s*\(\s*--color-/i.test(css))
  if (cssChunks.length > 0 && !usesColorVar) {
    violations.push('לא נמצא שימוש כלשהו ב-var(--color-*) — חובה להזין צבעים מ-API לפי תיעוד העיצוב')
  }

  return {
    compliant: violations.length === 0,
    violations
  }
}

const CALL_RE = /Otzaria\s*\.\s*call\s*\(\s*['"]([a-zA-Z][\w.]*)['"]/g
const ON_RE = /Otzaria\s*\.\s*on\s*\(\s*['"]([a-zA-Z][\w.]*)['"]/g
const OFF_RE = /Otzaria\s*\.\s*off\s*\(\s*['"]([a-zA-Z][\w.]*)['"]/g
// Shorthand `Otzaria.app.getInfo(...)`. שם המודול והשיטה במקרה רגיש.
const SHORTHAND_RE = /Otzaria\s*\.\s*([a-z][a-zA-Z0-9_]*)\s*\.\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\(/g
// Otzaria.on/off/call/emit/once/use/setup/init - לא לטעות בהן כקריאות ל-API
const RESERVED_HOLDER_FIELDS = new Set(['call', 'on', 'off', 'emit', 'once', 'use', 'init', 'setup', 'ready'])

// מסיר הערות (JSDoc/block/line/HTML) לפני סריקת קריאות API, כדי שדוגמאות `@example`
// בתוך SDK shim שמוטמע בתוסף לא יסומנו כאילו התוסף משתמש ב-API.
function stripCommentsForScan(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')   // HTML comments
    .replace(/\/\*[\s\S]*?\*\//g, '')  // JS block/JSDoc comments
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1') // JS line comments (לא לפגוע ב-https://)
}

function scanCodeForApiUsage(text) {
  const cleaned = stripCommentsForScan(text)
  const methods = new Set()
  const events = new Set()
  let m
  CALL_RE.lastIndex = 0
  while ((m = CALL_RE.exec(cleaned)) !== null) methods.add(m[1])
  SHORTHAND_RE.lastIndex = 0
  while ((m = SHORTHAND_RE.exec(cleaned)) !== null) {
    if (RESERVED_HOLDER_FIELDS.has(m[1])) continue
    methods.add(`${m[1]}.${m[2]}`)
  }
  ON_RE.lastIndex = 0
  while ((m = ON_RE.exec(cleaned)) !== null) events.add(m[1])
  OFF_RE.lastIndex = 0
  while ((m = OFF_RE.exec(cleaned)) !== null) events.add(m[1])
  return { methods, events }
}

// --- Public entry point ------------------------------------------------------

/**
 * Validate a plugin archive (.otzplugin ZIP) against the official Otzaria SDK spec.
 *
 * @param {Buffer} buffer - the plugin file as Buffer
 * @returns {Promise<{errors: string[], warnings: string[], spec: {source: string, fetchedAt: string}}>}
 */
export async function validatePluginArchive(buffer) {
  const errors = []
  const warnings = []

  let spec
  try {
    spec = await getApiSpec()
  } catch {
    spec = buildFallbackSpec()
  }

  let files
  try {
    files = extractZipFiles(buffer, (name) =>
      name === 'manifest.json' || isCodeLikeFile(name) || isStyleLikeFile(name)
    )
  } catch (err) {
    errors.push(`לא ניתן לקרוא את קובץ ה-ZIP של התוסף: ${err.message}`)
    return {
      errors,
      warnings,
      design: { compliant: false, violations: [] },
      spec: { source: spec.source, fetchedAt: spec.fetchedAt }
    }
  }

  // ---- Manifest ----
  const manifestBuf = files.get('manifest.json')
  if (!manifestBuf) {
    errors.push('manifest.json לא נמצא בקובץ התוסף')
    return {
      errors,
      warnings,
      design: { compliant: false, violations: [] },
      spec: { source: spec.source, fetchedAt: spec.fetchedAt }
    }
  }
  let manifest
  try {
    // עורכים בווינדוז שומרים לעיתים JSON עם BOM (U+FEFF) בתחילת הקובץ. JSON.parse לא יודע להתמודד.
    manifest = JSON.parse(manifestBuf.toString('utf8').replace(/^﻿/, ''))
  } catch (err) {
    errors.push(`manifest.json אינו JSON תקין: ${err.message}`)
    return {
      errors,
      warnings,
      design: { compliant: false, violations: [] },
      spec: { source: spec.source, fetchedAt: spec.fetchedAt }
    }
  }

  // Permissions - חובה להיות מערך של מחרוזות מהרשימה הרשמית
  const declaredPermissions = Array.isArray(manifest.permissions) ? manifest.permissions : []
  if (manifest.permissions !== undefined && !Array.isArray(manifest.permissions)) {
    errors.push('השדה permissions ב-manifest חייב להיות מערך של מחרוזות')
  }
  const declaredSet = new Set()
  for (const perm of declaredPermissions) {
    if (typeof perm !== 'string') {
      errors.push(`הרשאה לא תקינה ב-manifest (לא מחרוזת): ${JSON.stringify(perm)}`)
      continue
    }
    declaredSet.add(perm)
    if (!spec.permissions.has(perm)) {
      errors.push(`הרשאה לא קיימת ב-manifest: "${perm}". יש לעיין בתיעוד הרשמי לרשימת ההרשאות התקפות`)
    }
  }

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
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
          errors.push(`כתובת לא תקינה ב-network.allowlist: ${JSON.stringify(url)} (חובה http(s) URL מלא)`)
        } else if (url.includes('*')) {
          errors.push(`network.allowlist אינו תומך ב-wildcard: ${url}`)
        }
      }
    }
  }

  // שם התוסף וכותרת ה-toolTab חייבים להיות זהים — אחרת התוסף יוצג בחנות בשם אחד
  // אבל בלשונית בתוך התוכנה בשם אחר, וזה מבלבל למשתמש.
  const manifestName = typeof manifest.name === 'string' ? manifest.name.trim() : ''
  const toolTabTitle = manifest.contributes?.toolTab?.title
  if (manifestName && typeof toolTabTitle === 'string' && toolTabTitle.trim() !== '') {
    const titleNorm = toolTabTitle.trim()
    if (titleNorm !== manifestName) {
      errors.push(
        `שם התוסף ב-manifest ("${manifestName}") שונה מכותרת התוסף ב-contributes.toolTab.title ("${titleNorm}"). השמות חייבים להיות זהים`
      )
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

  // ---- Code scan ----
  const apiUsage = new Map()    // method -> Set<filename>
  const eventUsage = new Map()  // event -> Set<filename>
  for (const [name, buf] of files) {
    if (!isCodeLikeFile(name)) continue
    let text
    try {
      text = buf.toString('utf8')
    } catch {
      continue
    }
    const { methods, events } = scanCodeForApiUsage(text)
    for (const method of methods) {
      if (!apiUsage.has(method)) apiUsage.set(method, new Set())
      apiUsage.get(method).add(name)
    }
    for (const ev of events) {
      if (!eventUsage.has(ev)) eventUsage.set(ev, new Set())
      eventUsage.get(ev).add(name)
    }
  }

  const unknownMethods = []
  for (const [method, sources] of apiUsage) {
    if (spec.apiMethods.has(method) || KNOWN_UNDOCUMENTED_METHODS.has(method)) continue
    unknownMethods.push({ method, sources: [...sources] })
  }
  for (const { method, sources } of unknownMethods) {
    warnings.push(`קריאה ל-API לא מוכר: ${method} (קבצים: ${sources.join(', ')})`)
  }

  const unknownEvents = []
  for (const [ev, sources] of eventUsage) {
    if (spec.events.has(ev)) continue
    unknownEvents.push({ event: ev, sources: [...sources] })
  }
  for (const { event, sources } of unknownEvents) {
    warnings.push(`רישום ל-event לא מוכר: ${event} (קבצים: ${sources.join(', ')})`)
  }

  // Cross-check: methods used but their required permission missing
  for (const [method] of apiUsage) {
    const required = METHOD_REQUIRED_PERMISSION[method]
    if (!required) continue
    if (!declaredSet.has(required)) {
      warnings.push(`התוסף משתמש ב-${method} אך לא ביקש את ההרשאה "${required}" ב-manifest`)
    }
  }

  // Cross-check: events subscribed but matching events.subscribe:* permission missing
  for (const [ev] of eventUsage) {
    const eventPerm = `events.subscribe:${ev}`
    if (!spec.permissions.has(eventPerm)) continue // not a permission-gated event
    if (!declaredSet.has(eventPerm)) {
      warnings.push(`רישום ל-event "${ev}" דורש את ההרשאה "${eventPerm}" שלא הוכרזה ב-manifest`)
    }
  }

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
    design,
    spec: { source: spec.source, fetchedAt: spec.fetchedAt }
  }
}

// מיפוי method -> permission חובה (חתך מהתיעוד הרשמי)
const METHOD_REQUIRED_PERMISSION = {
  'app.getInfo': 'app.info.read',
  'app.getTheme': 'app.info.read',
  'app.getLocale': 'app.info.read',
  'app.getGrantedPermissions': 'app.info.read',
  'app.getUserEmail': 'app.user_email.read',
  'library.findBooks': 'library.books.read',
  'library.getBookMetadata': 'library.books.read',
  'library.listRecentBooks': 'library.books.read',
  'library.getBookContent': 'library.content.read',
  'library.getBookToc': 'library.content.read',
  'search.fullText': 'search.fulltext.read',
  'reader.openBook': 'reader.open',
  'reader.openBookAtRef': 'reader.open',
  'reader.getCurrentState': 'reader.open',
  'reader.getCurrentRef': 'reader.open',
  'reader.getSelection': 'reader.open',
  'reader.addContextMenuItem': 'reader.context_menu',
  'reader.removeContextMenuItem': 'reader.context_menu',
  'reader.setHighlight': 'reader.highlight',
  'reader.getHighlights': 'reader.highlight',
  'reader.clearHighlight': 'reader.highlight',
  'reader.clearAllHighlights': 'reader.highlight',
  'navigation.goTo': 'navigation.write',
  'notes.list': 'notes.read',
  'notes.getBookNotesSummary': 'notes.read',
  'notes.add': 'notes.write',
  'notes.update': 'notes.write',
  'notes.delete': 'notes.write',
  'ui.showMessage': 'ui.feedback',
  'ui.showSuccess': 'ui.feedback',
  'ui.showError': 'ui.feedback',
  'ui.showConfirm': 'ui.feedback',
  'ui.showWarning': 'ui.feedback',
  'feedback.sendEmail': 'feedback.send_email',
  'history.list': 'history.read',
  'history.listSearches': 'history.read',
  'history.clear': 'history.write',
  'history.remove': 'history.write',
  'notifications.showInApp': 'notifications.send',
  'notifications.sendSystem': 'notifications.system',
  'notifications.scheduleSystem': 'notifications.system',
  'notifications.cancel': 'notifications.system',
  'notifications.cancelAll': 'notifications.system',
  'notifications.checkPermissions': 'notifications.system',
  'notifications.requestPermissions': 'notifications.system',
  'storage.get': 'plugin.storage.read',
  'storage.set': 'plugin.storage.write',
  'storage.remove': 'plugin.storage.write',
  'storage.list': 'plugin.storage.read',
  'settings.get': 'settings.read',
  'settings.getMany': 'settings.read',
  'calendar.getSelectedDate': 'calendar.read',
  'calendar.getDailyTimes': 'calendar.read',
  'calendar.getHalachicTimes': 'calendar.read',
  'calendar.getJewishDate': 'calendar.read',
  'calendar.getEvents': 'calendar.read',
  'publishedData.upsert': 'published_data.write',
  'publishedData.remove': 'published_data.write',
  'publishedData.listOwn': 'published_data.write',
  'database.listSources': 'database.read',
  'database.describeSource': 'database.read',
  'database.query': 'database.read',
  'database.batchQuery': 'database.read'
}
