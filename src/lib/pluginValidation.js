import { unzipSync } from 'fflate'

// --- Fallback snapshot of the official Otzaria plugin SDK API_REFERENCE.md ----
// כשה-fetch מ-GitHub נכשל מסתמכים על הרשימות הללו. יש לעדכן בעת שינוי בתיעוד הרשמי.
// https://github.com/Otzaria/otzaria/blob/dev/docs/plugin-sdk/API_REFERENCE.md

const FALLBACK_PERMISSIONS = [
  'app.info.read',
  'app.user_email.read',
  'app.open_url',
  'app.run_on_startup',
  'app.background_keep_alive',
  'app.startup_contributions',
  'library.books.read',
  'library.content.read',
  'library.links.read',
  'search.fulltext.read',
  'reader.open',
  'reader.context_menu',
  'reader.toolbar',
  'reader.highlight',
  'search.dialog',
  'navigation.write',
  'notes.read',
  'notes.write',
  'calendar.read',
  'settings.read',
  'ui.feedback',
  'ui.create_shortcut',
  'fs.user_files.read',
  'fs.folder_access',
  'plugin.storage.read',
  'plugin.storage.write',
  'plugin.open_other',
  'published_data.write',
  'network.access',
  'network.localhost',
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
  'events.subscribe:reader.sectionContentChanged',
  'events.subscribe:theme.changed',
  'events.subscribe:settings.changed',
  'events.subscribe:calendar.date_changed',
  'events.subscribe:calendar.city_changed',
  'events.subscribe:workspace.changed',
  'events.subscribe:plugin.permissions_changed'
]

// הרשאות בסיס (אוצריא 0.9.97+): ניתנות אוטומטית לכל תוסף. שימוש ב-API שלהן
// בלי הצהרה אינו אזהרה; הצהרה עליהן מקבלת אזהרת דעיכה בלבד.
// שיקוף של pluginBaselinePermissions באפליקציה.
const BASELINE_PERMISSIONS = new Set([
  'plugin.storage.read',
  'plugin.storage.write',
  'app.info.read',
  'ui.feedback',
  'notifications.send',
  'events.subscribe:theme.changed'
])

// הרשאה חדשה (key) שהצהרה ותיקה (value) מכסה אותה —
// ui.pickFolder ישב היסטורית תחת ui.feedback.
const LEGACY_PERMISSION_ALIASES = {
  'fs.folder_access': 'ui.feedback'
}

// גרסת אוצריא המינימלית שבה הרשאה מוצהרת קיימת. minAppVersion ישן יותר הוא
// שגיאה חוסמת — אוצריא ישנה דוחה הרשאה לא מוכרת בהתקנה.
const PERMISSION_MIN_VERSION = {
  'fs.folder_access': '0.9.97',
  'plugin.open_other': '0.9.97'
}

// תנאי `when` על תרומות contributes.startup נתמך מגרסה זו. תואם
// _whenConditionMinVersion ב-plugin_extended_validator.dart.
const WHEN_CONDITION_MIN_VERSION = '0.9.97'

// הגדרות אוצריא שתוסף רשאי לקרוא בעלה `setting` של when. רשימה קשיחה —
// שיקוף של PluginSettingsAccessPolicy (allowlist פחות blocklist) בקובץ
// lib/plugins/services/plugin_settings_access_policy.dart בריפו של אוצריא.
// מפתח שאינו כאן מוערך כ-false בזמן ריצה, ולכן נחסם כבר בהגשה.
const WHEN_READABLE_SETTING_KEYS = new Set([
  'key-dark-mode',
  'key-follow-system-theme',
  'key-swatch-color',
  'key-dark-swatch-color',
  'key-font-size',
  'key-font-family',
  'key-commentators-font-family',
  'key-commentators-font-size',
  'key-line-height',
  'key-selected-city',
  'key-calendar-type',
  'key-settings-language',
  'key-show-teamim',
  'key-default-nikud',
  'key-remove-nikud-tanach',
  'key-replace-holy-names',
  'key-library-view-mode',
  'key-copy-with-headers',
  'key-copy-header-format',
  'key-hebrew-books-path'
])

const FALLBACK_API_METHODS = [
  'app.getInfo', 'app.getTheme', 'app.getLocale', 'app.getUserEmail', 'app.getGrantedPermissions',
  'app.getConnectivity',
  'app.openUrl',
  'library.findBooks', 'library.getBookMetadata',
  'library.resolveBooks', 'library.resolveCategoryPaths', 'library.listRecentBooks',
  'library.getBookContent', 'library.getBookToc',
  'library.listBookAltStructures', 'library.getBookAltToc',
  'library.getCommentators', 'library.getLinks', 'library.getLinkTargetsSummary', 'library.getLinkContent',
  'search.fullText', 'search.query', 'search.getOptions',
  'reader.openBook', 'reader.openBookAtRef', 'reader.openSearchTab',
  'reader.getCurrentState', 'reader.getCurrentRef',
  'reader.getSelection', 'reader.getActiveCommentators',
  'reader.addContextMenuItem', 'reader.removeContextMenuItem', 'reader.updateContextMenuItem',
  'reader.addToolbarItem', 'reader.removeToolbarItem', 'reader.updateToolbarItem',
  'reader.findTextOccurrences', 'reader.getSectionTextMap',
  'reader.setHighlight', 'reader.updateHighlight', 'reader.getHighlights',
  'reader.revealHighlight', 'reader.clearHighlight', 'reader.clearAllHighlights',
  'reader.registerInBookSearchProvider', 'reader.respondInBookSearch',
  'reader.registerExternalSearchProvider', 'reader.respondExternalSearch',
  'navigation.goTo',
  'plugin.openSelf',
  'plugin.openOther',
  'plugin.backgroundDone',
  'notes.list', 'notes.getBookNotesSummary', 'notes.add', 'notes.update', 'notes.delete',
  'ui.showMessage', 'ui.showSuccess', 'ui.showError', 'ui.showConfirm', 'ui.showWarning',
  'feedback.sendEmail', 'feedback.report', 'feedback.hasReporterEmail',
  'history.list', 'history.listSearches', 'history.clear', 'history.remove',
  'notifications.showInApp', 'notifications.sendSystem', 'notifications.scheduleSystem',
  'notifications.cancel', 'notifications.cancelAll', 'notifications.checkPermissions',
  'notifications.requestPermissions',
  'storage.get', 'storage.set', 'storage.remove', 'storage.list',
  'settings.get', 'settings.getMany',
  'calendar.getSelectedDate', 'calendar.getDailyTimes', 'calendar.getHalachicTimes',
  'calendar.getJewishDate', 'calendar.getEvents', 'calendar.getCities',
  'publishedData.upsert', 'publishedData.remove', 'publishedData.listOwn',
  'database.listSources', 'database.describeSource', 'database.query', 'database.batchQuery',
  'library.getTree',
  'network.fetch', 'network.fetchStream', 'network.download',
  'ui.pickFolder',
  'fs.extractZip', 'fs.deleteFile',
  'fs.pickUserFile', 'fs.resolveFileUrl', 'fs.readTextFile', 'fs.revokeFile',
  'shortcut.create'
]

// גרסת אוצריא המינימלית שבה כל API התווסף. תואם FALLBACK_METHOD_MIN_VERSION
// ב-otzaria-plugin-validator, _methodMinVersion ב-plugin_extended_validator.dart
// וטבלת "גרסאות API" ב-API_REFERENCE.md. תוסף שקורא ל-API חדש מ-minAppVersion
// שהצהיר → שגיאה חוסמת. יש לעדכן יחד עם שינוי ב-SDK.
const FALLBACK_METHOD_MIN_VERSION = {
  // 0.9.89 — מערכת התוספים הראשונה (כל ה-APIs הבסיסיים)
  'app.getInfo': '0.9.89',
  'app.getTheme': '0.9.89',
  'app.getLocale': '0.9.89',
  'app.getUserEmail': '0.9.89',
  'app.getGrantedPermissions': '0.9.89',
  'library.findBooks': '0.9.89',
  'library.getBookMetadata': '0.9.89',
  'library.listRecentBooks': '0.9.89',
  'library.getBookContent': '0.9.89',
  'library.getBookToc': '0.9.89',
  'search.fullText': '0.9.89',
  'reader.openBook': '0.9.89',
  'reader.openBookAtRef': '0.9.89',
  'reader.getCurrentState': '0.9.89',
  'reader.getCurrentRef': '0.9.89',
  'reader.getSelection': '0.9.89',
  'reader.addContextMenuItem': '0.9.89',
  'reader.removeContextMenuItem': '0.9.89',
  'reader.setHighlight': '0.9.89',
  'reader.getHighlights': '0.9.89',
  'reader.clearHighlight': '0.9.89',
  'reader.clearAllHighlights': '0.9.89',
  'reader.openSearchTab': '0.9.89',
  'navigation.goTo': '0.9.89',
  'notes.list': '0.9.89',
  'notes.getBookNotesSummary': '0.9.89',
  'notes.add': '0.9.89',
  'notes.update': '0.9.89',
  'notes.delete': '0.9.89',
  'ui.showMessage': '0.9.89',
  'ui.showSuccess': '0.9.89',
  'ui.showError': '0.9.89',
  'ui.showConfirm': '0.9.89',
  'ui.showWarning': '0.9.89',
  'feedback.sendEmail': '0.9.89',
  'history.list': '0.9.89',
  'history.listSearches': '0.9.89',
  'history.clear': '0.9.89',
  'history.remove': '0.9.89',
  'notifications.showInApp': '0.9.89',
  'notifications.sendSystem': '0.9.89',
  'notifications.scheduleSystem': '0.9.89',
  'notifications.cancel': '0.9.89',
  'notifications.cancelAll': '0.9.89',
  'notifications.checkPermissions': '0.9.89',
  'notifications.requestPermissions': '0.9.89',
  'storage.get': '0.9.89',
  'storage.set': '0.9.89',
  'storage.remove': '0.9.89',
  'storage.list': '0.9.89',
  'settings.get': '0.9.89',
  'settings.getMany': '0.9.89',
  'calendar.getSelectedDate': '0.9.89',
  // שוחררו ב-0.9.92: נעדרים מ-plugin_bridge_adapter.dart בתג 0.9.91+622 וקיימים
  // בתג 0.9.92+631. ערך 0.9.97 כאן היה חוסם תוספים שכבר משתמשים בהן.
  'calendar.getDailyTimes': '0.9.92',
  'calendar.getHalachicTimes': '0.9.92',
  'calendar.getJewishDate': '0.9.89',
  'calendar.getEvents': '0.9.89',
  'calendar.getCities': '0.9.96',
  'publishedData.upsert': '0.9.89',
  'publishedData.remove': '0.9.89',
  'publishedData.listOwn': '0.9.89',
  'database.listSources': '0.9.89',
  'database.describeSource': '0.9.89',
  'database.query': '0.9.89',
  'database.batchQuery': '0.9.89',
  // 0.9.93
  'library.getTree': '0.9.93',
  'network.fetch': '0.9.93',
  'network.download': '0.9.93',
  'fs.deleteFile': '0.9.93',
  'fs.extractZip': '0.9.93',
  'ui.pickFolder': '0.9.93',
  // 0.9.94
  'shortcut.create': '0.9.94',
  'fs.pickUserFile': '0.9.94',
  'fs.readTextFile': '0.9.94',
  'fs.resolveFileUrl': '0.9.94',
  'fs.revokeFile': '0.9.94',
  'reader.updateContextMenuItem': '0.9.95',
  'reader.findTextOccurrences': '0.9.95',
  'reader.getSectionTextMap': '0.9.95',
  'reader.updateHighlight': '0.9.95',
  // 0.9.95
  'app.openUrl': '0.9.95',
  // 0.9.96
  'plugin.openSelf': '0.9.96',
  'app.getConnectivity': '0.9.96',
  'library.listBookAltStructures': '0.9.96',
  'library.getBookAltToc': '0.9.96',
  'reader.revealHighlight': '0.9.96',
  // 0.9.97
  'plugin.openOther': '0.9.97',
  'plugin.backgroundDone': '0.9.97',
  'feedback.report': '0.9.97',
  'feedback.hasReporterEmail': '0.9.97',
  'library.resolveBooks': '0.9.97',
  'library.resolveCategoryPaths': '0.9.97',
  'library.getCommentators': '0.9.97',
  'library.getLinks': '0.9.97',
  'library.getLinkTargetsSummary': '0.9.97',
  'library.getLinkContent': '0.9.97',
  'search.query': '0.9.97',
  'search.getOptions': '0.9.97',
  'reader.getActiveCommentators': '0.9.97',
  'reader.addToolbarItem': '0.9.97',
  'reader.removeToolbarItem': '0.9.97',
  'reader.updateToolbarItem': '0.9.97',
  'reader.registerInBookSearchProvider': '0.9.97',
  'reader.respondInBookSearch': '0.9.97',
  'reader.registerExternalSearchProvider': '0.9.97',
  'reader.respondExternalSearch': '0.9.97',
  'network.fetchStream': '0.9.97'
}

// תואם _knownEvents ב-lib/plugins/services/plugin_extended_validator.dart
// בריפו של אוצריא. קוד האפליקציה הוא מקור האמת; API_REFERENCE עשוי להתעדכן באיחור.
const FALLBACK_EVENTS = [
  'plugin.boot', 'plugin.ready',
  'plugin.suspended', 'plugin.resumed',
  'plugin.page_opened',
  'theme.changed',
  'navigation.changed',
  'reader.current_book_changed', 'reader.current_ref_changed',
  'reader.selection_changed', 'reader.sectionContentChanged',
  'reader.context_menu_item_clicked', 'reader.toolbar_item_clicked',
  'contextMenu.itemClicked', 'contextMenu.colorClicked',
  'calendar.date_changed', 'calendar.city_changed', 'workspace.changed',
  'settings.changed', 'plugin.permissions_changed',
  'search.requested', 'search.external.requested',
  'reader.inBookSearch.requested', 'ui.messageClicked'
]

// hosts חשופים (ללא סכימה) שמותרים ב-network.allowlist.
// שיקוף של _loopbackHosts ב-lib/plugins/models/plugin_network_allowlist.dart.
const LOOPBACK_ALLOWLIST_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

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
    methodMinVersions: new Map(Object.entries(FALLBACK_METHOD_MIN_VERSION)),
    events: new Set(FALLBACK_EVENTS),
    source: 'fallback',
    fetchedAt: new Date().toISOString()
  }
}

// משווה שתי גרסאות לפי שלושת רכיבי הליבה major.minor.patch (מתעלם מ-build/prerelease).
// תואם PluginVersionUtils.compareCoreVersions ב-Otzaria.
function compareCoreVersions(first, second) {
  const core = (v) => String(v).split('+')[0].split('-')[0].trim()
  const parse = (v) => {
    const s = core(v)
    if (s === '') throw new Error(`פורמט גרסה לא חוקי: ${v}`)
    return s.split('.').map((seg) => {
      const n = Number(seg)
      if (!Number.isInteger(n)) throw new Error(`פורמט גרסה לא חוקי: ${v}`)
      return n
    })
  }
  const a = parse(first)
  const b = parse(second)
  for (let i = 0; i < 3; i++) {
    const x = i < a.length ? a[i] : 0
    const y = i < b.length ? b[i] : 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

function looksLikePermission(token) {
  // הרשאות ב-snake_case מנוקדות, ללא camelCase. למשל: library.books.read, plugin.storage.write.
  if (token.startsWith('events.subscribe:')) {
    const tail = token.slice('events.subscribe:'.length)
    // נבדק: לינארי — מפריד '.' חובה בכל איטרציה מונע backtracking קטסטרופלי
    // eslint-disable-next-line security/detect-unsafe-regex
    return /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/.test(tail)
  }
  // נבדק: לינארי — מפריד '.' חובה בכל איטרציה מונע backtracking קטסטרופלי
  // eslint-disable-next-line security/detect-unsafe-regex
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

  // 3b. "טבלת גרסאות API" — שורות בפורמט ``| `namespace.method` | 0.9.89 |``.
  const methodMinVersions = new Map()
  const versionRowRe = /^\|\s*`([a-z][a-zA-Z0-9_]*\.[a-zA-Z0-9_]+)`\s*\|\s*(\d+\.\d+\.\d+)\s*\|/gm
  while ((match = versionRowRe.exec(md)) !== null) {
    methodMinVersions.set(match[1], match[2])
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
  // הוולידטור באתר חייב לקבל כל event שהוולידטור של אפליקציית אוצריא מקבל,
  // גם אם API_REFERENCE המרוחק עדיין אינו מציין אותו.
  for (const supportedEvent of FALLBACK_EVENTS) events.add(supportedEvent)
  // ארועי lifecycle אינם תמיד מצוטטים. נשמור על הוספתם אם הופיעו במסמך.
  for (const lifecycle of ['plugin.boot', 'plugin.ready', 'plugin.suspended', 'plugin.resumed', 'plugin.page_opened']) {
    if (md.includes(lifecycle)) events.add(lifecycle)
  }

  if (permissions.size < 5 || apiMethods.size < 10) {
    throw new Error('Parsed API reference looked malformed')
  }

  return {
    permissions,
    apiMethods,
    // doc ישן ללא טבלת גרסאות — נופלים ל-floor המקובע כדי שהאכיפה לא תיעלם.
    methodMinVersions: methodMinVersions.size > 0
      ? methodMinVersions
      : new Map(Object.entries(FALLBACK_METHOD_MIN_VERSION)),
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
// הסלקטור של הכלל שבתוכו נמצא ההיסט — לחריגים תלויי-סלקטור בסריקת ה-CSS.
// (סריקה טקסטואלית: נסוגים אל ה-'{' הפותח, והסלקטור הוא מה שלפניו עד סוף
//  הכלל/הבלוק הקודם.)
function selectorAtOffset(css, index) {
  const open = css.lastIndexOf('{', index)
  if (open <= 0) return ''
  const start = Math.max(css.lastIndexOf('}', open - 1), css.lastIndexOf('{', open - 1))
  return css.slice(start + 1, open).trim()
}

// פס כותרת התוסף — הסלקטור המוסכם ב-DESIGN_GUIDE (`.topbar` / `.top-bar`).
function isTopBarSelector(selector) {
  return /top-?bar/i.test(selector)
}

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
    // הגדרות CSS custom properties (`--color-foo: #xxx;`, `--radius-md: 12px;`)
    // מותרות במפורש לפי DESIGN_GUIDE — הן ברירות מחדל לפני applyTheme. מסירים
    // אותן לפני סריקת צבעים/גדלים גולמיים, כפי שעושה ה-packager של אוצריא.
    const stripped = stripCssComments(css)
      .replace(/--[a-zA-Z_][\w-]*\s*:\s*[^;}]+;?/g, '')
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
      // נבדק: לינארי — כמתים חד-רמתיים, אין נסיגה קטסטרופלית
      // eslint-disable-next-line security/detect-unsafe-regex
      if (/^\d+(?:\.\d+)?\s*(?:em|rem|%)$/i.test(value)) continue
      if (/^0(?:px)?$/.test(value)) continue
      // חריג פס הכותרת: DESIGN_GUIDE מחייב שם גדלים קשיחים ב-px דווקא, כדי
      // שהפס לא יתנפח עם גופן הקריאה של המשתמש. נאכף לפי שם הסלקטור.
      if (isTopBarSelector(selectorAtOffset(stripped, fsMatch.index))) continue
      if (/\d+\s*px/i.test(value)) {
        addOnce('font-size-px', `${name}: font-size ב-px קבוע ("${value.slice(0, 30)}"). חובה em/rem או var(--font-size-base) (px מותר רק בסלקטור פס הכותרת — ראו DESIGN_GUIDE.md)`)
        break
      }
    }

    // 6. border-radius בערכי px ארביטררים (לא 0, לא var)
    const radiusRe = /border-radius\s*:\s*([^;}]+)/gi
    let brMatch
    while ((brMatch = radiusRe.exec(stripped)) !== null) {
      const value = brMatch[1].trim()
      if (/var\s*\(/.test(value)) continue
      // נבדק: לינארי — מפריד '\s+' חובה בכל איטרציה
      // eslint-disable-next-line security/detect-unsafe-regex
      if (/^0(?:px)?(?:\s+0(?:px)?)*$/.test(value)) continue
      // נבדק: לינארי — כמתים חד-רמתיים
      // eslint-disable-next-line security/detect-unsafe-regex
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

// מסיר הערות (JSDoc/block/HTML + line בתחילת שורה) לפני סריקת קריאות API,
// כדי שדוגמאות `@example` בתוך SDK shim שמוטמע בתוסף לא יסומנו כקריאות אמת.
// מכוון: לא מסיר // אמצע-שורה כדי לא לפגוע במחרוזות שמכילות '//' (URLs, regex וכד').
// מקרי קצה של Otzaria.call(...) בתוך // הערה ייפסו לאזהרת שווא נדירה, וזה מחיר סביר.
// הערת אבטחה: false positive מאומת עבור התראת CodeQL js/incomplete-multi-character-sanitization (נסגרה ידנית ב-GitHub, ראו הסבר): this strips comments
// before scanning plugin code text for API-call names (a static lint check for docs), not
// sanitizing HTML for output — nothing here reaches dangerouslySetInnerHTML or similar.
function stripCommentsForScan(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')        // HTML comments
    .replace(/\/\*[\s\S]*?\*\//g, '')       // JS block / JSDoc comments
    .replace(/^[ \t]*\/\/.*$/gm, '')        // JS line comments בתחילת שורה (אחרי whitespace)
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

// --- contributes.startup: תנאי when -----------------------------------------

// מגבלות הסכימה — שיקוף של PluginWhenCondition ב-
// lib/plugins/models/plugin_when_condition.dart בריפו של אוצריא.
const WHEN_MAX_DEPTH = 5
const WHEN_MAX_LEAVES = 20
const WHEN_MAX_KEY_LENGTH = 128
const WHEN_LEAF_OPERATORS = ['equals', 'notEquals', 'exists']

class WhenConditionError extends Error {}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasField(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field)
}

/** מפרסר עלה (`setting`/`storage`) ואוסף את מפתחו לפי סוגו. */
function parseWhenLeaf(raw, kind, state) {
  state.leaves += 1
  if (state.leaves > WHEN_MAX_LEAVES) {
    throw new WhenConditionError('when has too many conditions')
  }
  if (!isPlainObject(raw)) {
    throw new WhenConditionError('when leaf must be an object with a key')
  }
  const key = raw.key
  if (typeof key !== 'string' || key.length === 0 || key.length > WHEN_MAX_KEY_LENGTH) {
    throw new WhenConditionError(
      'when leaf key must be a non-empty string of up to 128 characters'
    )
  }
  const unknown = Object.keys(raw).find(
    (field) => field !== 'key' && !WHEN_LEAF_OPERATORS.includes(field)
  )
  if (unknown !== undefined) {
    throw new WhenConditionError(`unsupported when field "${unknown}"`)
  }
  const declared = WHEN_LEAF_OPERATORS.filter((op) => hasField(raw, op))
  if (declared.length !== 1) {
    throw new WhenConditionError(
      'when leaf requires exactly one of equals, notEquals, exists'
    )
  }
  const operator = declared[0]
  const value = raw[operator]
  if (operator === 'exists') {
    if (typeof value !== 'boolean') {
      throw new WhenConditionError('when exists must be a bool')
    }
  } else if (
    value !== null &&
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new WhenConditionError('when comparison value must be a string, number or bool')
  }
  if (kind === 'setting') state.settingKeys.add(key)
}

/** מפרסר צומת בעץ `when` — עלה או קומבינטור. זורק WhenConditionError. */
function parseWhenNode(node, depth, state) {
  if (depth > WHEN_MAX_DEPTH) {
    throw new WhenConditionError('when is nested too deeply')
  }
  if (!isPlainObject(node)) {
    throw new WhenConditionError('when must be an object')
  }
  const keys = Object.keys(node)
  if (keys.length !== 1) {
    throw new WhenConditionError(
      'when must declare exactly one of setting, storage, all, any, not'
    )
  }
  const [operator] = keys
  const value = node[operator]
  switch (operator) {
    case 'setting':
    case 'storage':
      parseWhenLeaf(value, operator, state)
      return
    case 'all':
    case 'any':
      if (!Array.isArray(value) || value.length === 0 || value.length > WHEN_MAX_LEAVES) {
        throw new WhenConditionError(`${operator} must be a non-empty array of conditions`)
      }
      for (const child of value) parseWhenNode(child, depth + 1, state)
      return
    case 'not':
      parseWhenNode(value, depth + 1, state)
      return
    default:
      throw new WhenConditionError(`unsupported when operator "${operator}"`)
  }
}

/**
 * ולידציית תנאי `when` על תרומות contributes.startup: סכימה, מפתח הגדרה
 * שתוסף רשאי לקרוא, וגרסת מינימום. תואם _validateWhenConditions ב-
 * plugin_extended_validator.dart. תוסף בלי when כלל אינו נבדק כאן.
 *
 * @param {object} manifest - manifest.json מפוענח
 * @returns {string[]} שגיאות חוסמות
 */
export function validateStartupWhenConditions(manifest) {
  const errors = []
  const startup = manifest?.contributes?.startup
  if (!isPlainObject(startup)) return errors

  let hasWhen = false
  const validateRaw = (field, raw) => {
    if (raw === undefined || raw === null) return
    hasWhen = true
    const state = { leaves: 0, settingKeys: new Set() }
    try {
      parseWhenNode(raw, 1, state)
    } catch (err) {
      if (!(err instanceof WhenConditionError)) throw err
      errors.push(`contributes.startup.${field}: when לא תקין: ${err.message}`)
      return
    }
    for (const key of state.settingKeys) {
      if (!WHEN_READABLE_SETTING_KEYS.has(key)) {
        errors.push(
          `contributes.startup.${field}: when קורא הגדרה שאינה זמינה לתוספים ("${key}")`
        )
      }
    }
  }

  for (const field of ['toolbarItems', 'contextMenuItems', 'searchDialogItems']) {
    const items = startup[field]
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (isPlainObject(item)) validateRaw(field, item.when)
    }
  }

  const events = startup.activationEvents
  if (Array.isArray(events)) {
    for (const entry of events) {
      if (!isPlainObject(entry)) continue
      const unknown = Object.keys(entry).find((key) => key !== 'topic' && key !== 'when')
      if (unknown !== undefined) {
        errors.push(
          `contributes.startup.activationEvents: שדה לא מוכר "${unknown}" ` +
          '(מותרים topic ו-when בלבד)'
        )
      }
      validateRaw('activationEvents', entry.when)
    }
  }

  if (!hasWhen) return errors
  const minAppVersion =
    typeof manifest.minAppVersion === 'string' ? manifest.minAppVersion : '0.0.0'
  try {
    if (compareCoreVersions(WHEN_CONDITION_MIN_VERSION, minAppVersion) > 0) {
      errors.push(
        `תנאי when נתמך החל מגרסה ${WHEN_CONDITION_MIN_VERSION}, אך minAppVersion ` +
        `שהוצהר הוא ${minAppVersion}`
      )
    }
  } catch {
    // minAppVersion לא חוקי — ולידציית המניפסט מטפלת בכך
  }
  return errors
}

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
      advisories,
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
      advisories,
      design: { compliant: false, violations: [] },
      spec: { source: spec.source, fetchedAt: spec.fetchedAt }
    }
  }
  let manifest
  try {
    // עורכים בווינדוז שומרים לעיתים JSON עם BOM (U+FEFF) בתחילת הקובץ. JSON.parse לא יודע להתמודד.
    manifest = JSON.parse(manifestBuf.toString('utf8').replace(/^\uFEFF/, ''))
  } catch (err) {
    errors.push(`manifest.json אינו JSON תקין: ${err.message}`)
    return {
      errors,
      warnings,
      advisories,
      design: { compliant: false, violations: [] },
      spec: { source: spec.source, fetchedAt: spec.fetchedAt }
    }
  }

  // schemaVersion — אוצריא תומכת רק בסכמה 1. חסר (undefined) נחשב 1. נבדק
  // באוצריא (plugin_manifest_validator.dart) וב-CI; חייב להיבדק גם בחנות כדי
  // שמניפסט עם סכמה עתידית לא יתקבל בחנות ואז ייכשל בהתקנה.
  if (manifest.schemaVersion !== undefined && manifest.schemaVersion !== 1) {
    errors.push(`גרסת סכמה ${manifest.schemaVersion} של התוסף אינה נתמכת`)
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

  // שם התוסף וכותרת ה-toolTab חייבים להיות זהים — אחרת התוסף יוצג בחנות בשם אחד
  // אבל בלשונית בתוך התוכנה בשם אחר, וזה מבלבל למשתמש.
  const manifestName = typeof manifest.name === 'string' ? manifest.name.trim() : ''
  // שם התוסף מוצג בראש לשונית התוסף ב"כלים" — מעבר ל-14 תווים גולש מהכרטיסייה.
  if (manifestName.length > 14) {
    errors.push('שם התוסף חייב להכיל לכל היותר 14 תווים')
  }
  // description הוא התיאור הקצר שמוצג בכרטיס התוסף בחנות — מוגבל ל-150 תווים.
  const manifestDescription = typeof manifest.description === 'string' ? manifest.description.trim() : ''
  if (manifestDescription.length > 150) {
    errors.push('תיאור קצר חייב להכיל לכל היותר 150 תווים')
  }
  // title שהוגדר במפורש (כולל מחרוזת ריקה — שתציג טאב בלי טקסט) חייב להיות
  // זהה ל-name. title חסר (undefined) נופל לברירת המחדל (name) ולכן מדולג.
  const toolTabTitle = manifest.contributes?.toolTab?.title
  if (manifestName && typeof toolTabTitle === 'string') {
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
    // הרשאות בסיס ניתנות אוטומטית (אוצריא 0.9.97+) — אין צורך בהצהרה
    if (BASELINE_PERMISSIONS.has(required)) continue
    if (declaredSet.has(required)) continue
    // הצהרה ותיקה מכסה הרשאה שפוצלה ממנה (ui.feedback → fs.folder_access)
    if (LEGACY_PERMISSION_ALIASES[required] && declaredSet.has(LEGACY_PERMISSION_ALIASES[required])) continue
    // קריאות רשת מסתפקות גם ב-network.localhost (שירות מקומי), לא רק ב-network.access
    if (required === 'network.access' && declaredSet.has('network.localhost')) continue
    warnings.push(`התוסף משתמש ב-${method} אך לא ביקש את ההרשאה "${required}" ב-manifest`)
  }

  // הרשאת בסיס שהוצהרה — מיותרת; מומלץ להסיר בהזדמנות. advisory ולא warning:
  // ההצהרה תקינה לחלוטין ועובדת, ואין שום אי-תאימות ל-SDK. כאזהרה היא חסמה
  // כל עדכון של כל תוסף שמצהיר הרשאת בסיס (כולל תוסף החנות עצמו), שכן נתיבי
  // ההעלאה והעריכה פוסלים על כל אזהרה.
  for (const permission of declaredSet) {
    if (BASELINE_PERMISSIONS.has(permission)) {
      advisories.push(`ההרשאה "${permission}" ניתנת כיום אוטומטית לכל תוסף — אפשר להסירה מה-manifest`)
    }
  }

  // Cross-check חוסם: הרשאה מוצהרת חדשה מ-minAppVersion — אוצריא ישנה דוחה
  // הרשאה לא מוכרת בהתקנה.
  for (const permission of declaredSet) {
    const since = PERMISSION_MIN_VERSION[permission]
    if (!since) continue
    try {
      if (compareCoreVersions(since, typeof manifest.minAppVersion === 'string' ? manifest.minAppVersion : '0.0.0') > 0) {
        errors.push(
          `ההרשאה "${permission}" קיימת החל מגרסה ${since}, אך minAppVersion שהוצהר הוא ` +
          `${manifest.minAppVersion}. עדכן את minAppVersion ל-${since} לפחות`
        )
      }
    } catch {
      // minAppVersion לא חוקי — לא חוסמים כאן (ולידציית המניפסט תטפל בכך)
    }
  }

  // Cross-check חוסם: method חדש מ-minAppVersion שהוצהר. תוסף שקורא ל-API
  // שלא היה קיים בגרסת המינימום שלו יקרוס אצל משתמש בגרסה כזו.
  const minAppVersion = typeof manifest.minAppVersion === 'string' ? manifest.minAppVersion : '0.0.0'
  for (const [method, sources] of apiUsage) {
    const since = spec.methodMinVersions?.get(method)
    if (!since) continue
    try {
      if (compareCoreVersions(since, minAppVersion) > 0) {
        errors.push(
          `התוסף משתמש ב-${method} הקיים החל מגרסה ${since}, אך minAppVersion שהוצהר הוא ` +
          `${minAppVersion}. עדכן את minAppVersion ל-${since} לפחות (קבצים: ${[...sources].join(', ')})`
        )
      }
    } catch {
      // minAppVersion לא חוקי — לא חוסמים כאן (ולידציית המניפסט תטפל בכך)
    }
  }

  // Cross-check: events subscribed but matching events.subscribe:* permission missing
  for (const [ev] of eventUsage) {
    const eventPerm = `events.subscribe:${ev}`
    if (!spec.permissions.has(eventPerm)) continue // not a permission-gated event
    if (BASELINE_PERMISSIONS.has(eventPerm)) continue // הרשאת בסיס — ניתנת אוטומטית
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
    advisories,
    design,
    usedApiMethods: [...apiUsage.keys()],
    spec: { source: spec.source, fetchedAt: spec.fetchedAt }
  }
}

// מיפוי method -> permission חובה (חתך מהתיעוד הרשמי)
const METHOD_REQUIRED_PERMISSION = {
  'app.getInfo': 'app.info.read',
  'app.getTheme': 'app.info.read',
  'app.getLocale': 'app.info.read',
  'app.getGrantedPermissions': 'app.info.read',
  'app.getConnectivity': 'app.info.read',
  'app.getUserEmail': 'app.user_email.read',
  'app.openUrl': 'app.open_url',
  'library.findBooks': 'library.books.read',
  'library.getBookMetadata': 'library.books.read',
  'library.resolveBooks': 'library.books.read',
  'library.resolveCategoryPaths': 'library.books.read',
  'library.listRecentBooks': 'library.books.read',
  'library.getTree': 'library.books.read',
  'library.getBookContent': 'library.content.read',
  'library.getBookToc': 'library.content.read',
  'library.listBookAltStructures': 'library.content.read',
  'library.getBookAltToc': 'library.content.read',
  'library.getLinkContent': 'library.content.read',
  'library.getCommentators': 'library.links.read',
  'library.getLinks': 'library.links.read',
  'library.getLinkTargetsSummary': 'library.links.read',
  'search.fullText': 'search.fulltext.read',
  'search.query': 'search.fulltext.read',
  'search.getOptions': 'search.fulltext.read',
  'reader.openBook': 'reader.open',
  'reader.openBookAtRef': 'reader.open',
  'reader.openSearchTab': 'reader.open',
  'reader.registerInBookSearchProvider': 'reader.open',
  'reader.respondInBookSearch': 'reader.open',
  'reader.registerExternalSearchProvider': 'reader.open',
  'reader.respondExternalSearch': 'reader.open',
  'reader.getCurrentState': 'reader.open',
  'reader.getCurrentRef': 'reader.open',
  'reader.getSelection': 'reader.open',
  'reader.getActiveCommentators': 'reader.open',
  'reader.findTextOccurrences': 'reader.open',
  'reader.getSectionTextMap': 'reader.open',
  'reader.addContextMenuItem': 'reader.context_menu',
  'reader.removeContextMenuItem': 'reader.context_menu',
  'reader.updateContextMenuItem': 'reader.context_menu',
  'reader.addToolbarItem': 'reader.toolbar',
  'reader.removeToolbarItem': 'reader.toolbar',
  'reader.updateToolbarItem': 'reader.toolbar',
  'reader.setHighlight': 'reader.highlight',
  'reader.updateHighlight': 'reader.highlight',
  'reader.getHighlights': 'reader.highlight',
  'reader.revealHighlight': 'reader.highlight',
  'reader.clearHighlight': 'reader.highlight',
  'reader.clearAllHighlights': 'reader.highlight',
  'navigation.goTo': 'navigation.write',
  'plugin.openSelf': 'navigation.write',
  'plugin.openOther': 'plugin.open_other',
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
  'ui.pickFolder': 'fs.folder_access',
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
  'calendar.getCities': 'calendar.read',
  'publishedData.upsert': 'published_data.write',
  'publishedData.remove': 'published_data.write',
  'publishedData.listOwn': 'published_data.write',
  'database.listSources': 'database.read',
  'database.describeSource': 'database.read',
  'database.query': 'database.read',
  'database.batchQuery': 'database.read',
  'network.fetch': 'network.access',
  'network.fetchStream': 'network.access',
  'network.download': 'network.access',
  'shortcut.create': 'ui.create_shortcut',
  'fs.pickUserFile': 'fs.user_files.read',
  'fs.resolveFileUrl': 'fs.user_files.read',
  'fs.readTextFile': 'fs.user_files.read',
  'fs.revokeFile': 'fs.user_files.read'
}
