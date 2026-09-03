import path from 'path'

// ===== תוכנה נלווית לתוסף =====
// יש תוספים שאינם יכולים לעבוד לבדם: הם מדברים עם תוכנה שרצה על המחשב מחוץ
// לאוצריא. הדוגמה שהובילה לפיצ'ר היא "חברותא" — התוסף רץ ב-WebView ואינו יכול
// לפתוח סוקט UDP, ולכן מתאם קטן עושה זאת בשבילו, והתוסף מדבר איתו על loopback.
//
// **גבול שאין לטשטש בניסוח:** האתר אינו מריץ את המתקין ואינו יכול להריץ אותו —
// דפדפן לא מריץ קובץ שהורד. כל מה שיש כאן הוא הפצה מוצהרת: התוסף מסומן כדורש
// תוכנה, המתקין מוגש בהורדה נפרדת, והמשתמש מריץ אותו בעצמו.
//
// המתקין מועלה כקובץ נפרד ואינו נארז בתוך ה-.otzplugin. אוצריא מחלצת כל רשומה
// שבחבילה לתיקיית התוסף, ולתוסף אין (במכוון) שום הרשאת הרצה — כלומר בינארי
// שנארז בפנים רק תופח בכל התקנה ואיש לא יריץ אותו. לכן קובץ הרצה בתוך החבילה
// נחסם בהעלאה, וההצהרה נעשית דרך שדה המתקין.

// הפלטפורמות שאפשר להצהיר עליהן, והסיומות שמקובלות כמתקין בכל אחת.
export const COMPANION_PLATFORMS = {
  windows: { label: 'Windows', extensions: ['.exe', '.msi'] },
  linux: { label: 'Linux', extensions: ['.appimage', '.deb', '.rpm', '.sh'] },
  macos: { label: 'macOS', extensions: ['.dmg', '.pkg'] }
}

export const COMPANION_PLATFORM_KEYS = Object.keys(COMPANION_PLATFORMS)

// כל הסיומות המותרות כמתקין — ל-accept בטופס ולהודעות שגיאה.
export const COMPANION_UPLOAD_EXTENSIONS = COMPANION_PLATFORM_KEYS
  .flatMap((key) => COMPANION_PLATFORMS[key].extensions)

// סיומות שנחשבות קובץ הרצה כשהן נמצאות *בתוך* חבילת התוסף. זו הצהרה, לא
// אנטי-וירוס: הבדיקה היא על שמות הרשומות ב-central directory של ה-ZIP, בלי
// לפרוס תוכן ובלי לבדוק חתימות בתים. מי שמנסה לעקוף לא ייתפס כאן — הוא ייתפס
// באישור המנהל, שהוא הגבול האמיתי.
const EXECUTABLE_ENTRY_EXTENSIONS = new Set([
  '.exe', '.msi', '.msix', '.appx', '.com', '.scr',
  '.bat', '.cmd', '.ps1', '.vbs', '.sh',
  '.dll', '.so', '.dylib',
  '.jar', '.apk',
  '.dmg', '.pkg', '.deb', '.rpm', '.appimage'
])

function extensionOf(fileName) {
  return path.posix.extname((fileName || '').toString()).toLowerCase()
}

// שמות הרשומות בחבילה שנראות קובץ הרצה. entries מגיע מ-listPluginEntries.
export function findExecutableEntries(entries) {
  return (entries || [])
    .map((entry) => (typeof entry === 'string' ? entry : entry?.name))
    .filter((name) => typeof name === 'string' && EXECUTABLE_ENTRY_EXTENSIONS.has(extensionOf(name)))
}

export function normalizeCompanionPlatform(value) {
  const platform = (value || '').toString().trim().toLowerCase()
  return COMPANION_PLATFORM_KEYS.includes(platform) ? platform : null
}

export function companionPlatformLabel(platform) {
  return COMPANION_PLATFORMS[platform]?.label || ''
}

// גרסת התוכנה הנלווית אינה גרסת התוסף ואינה כפופה ל-X.Y.Z; היא נשמרת כטקסט
// ומוצגת כמו שהיא. התו-סט מוגבל כדי שלא ייכנס לכאן טקסט חופשי.
const COMPANION_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,39}$/

// אין כאן חישוב גיבוב במכוון: serializeCompanionForPublic נצרך גם מקוד לקוח
// (דרך pluginSubmission), ו-import של crypto היה נגרר לחבילת הדפדפן. הגיבוב
// מחושב בנתיב שקורא את הקובץ ומועבר לכאן כפרמטר.

// רשומת התוכנה הנלווית של תוסף שאין לו אחת. נשמרת מפורשת (ולא null) כדי
// שקוראים לא יצטרכו לבדוק קיום לפני present.
export function emptyCompanion() {
  return {
    present: false,
    name: '',
    version: '',
    platform: null,
    fileName: '',
    ext: '',
    size: 0,
    sha256: '',
    installsPlugin: false
  }
}

// בונה את המטא-דאטה של המתקין מתוך שדות הטופס. זורק Error בעברית — הקוראים
// מחזירים את המסר כמו שהוא למעלה התוסף.
//
// מקבל את הקובץ כשדות (fileName/size/sha256) ולא כאובייקט File, כדי שגם עריכת
// המטא-דאטה של תוכנה קיימת — בלי להעלות את המתקין מחדש — תעבור באותן בדיקות
// בדיוק, ובכללן התאמת הסיומת למערכת ההפעלה שהוצהרה.
export function buildCompanionMeta({ fileName: rawFileName, size, sha256, platform, name, version, installsPlugin, maxBytes }) {
  const resolvedPlatform = normalizeCompanionPlatform(platform)
  if (!resolvedPlatform) {
    throw new Error(`יש לבחור את מערכת ההפעלה של התוכנה הנלווית (${COMPANION_PLATFORM_KEYS.join(' / ')})`)
  }

  const fileName = path.basename((rawFileName || '').toString())
  const ext = extensionOf(fileName)
  const allowed = COMPANION_PLATFORMS[resolvedPlatform].extensions
  if (!allowed.includes(ext)) {
    throw new Error(
      `סיומת קובץ המתקין (${ext || 'ללא סיומת'}) אינה מתאימה ל-${companionPlatformLabel(resolvedPlatform)}. ` +
      `מותר: ${allowed.join(', ')}`
    )
  }

  if (!size) {
    throw new Error('קובץ המתקין של התוכנה הנלווית ריק')
  }
  if (maxBytes && size > maxBytes) {
    throw new Error(`קובץ המתקין חורג מהמגבלה של ${Math.floor(maxBytes / 1024 / 1024)}MB`)
  }

  const companionName = (name || '').toString().trim()
  if (!companionName) {
    throw new Error('יש למלא את שם התוכנה הנלווית — הוא מוצג למשתמש בדף התוסף')
  }
  if (companionName.length > 60) {
    throw new Error('שם התוכנה הנלווית מוגבל ל-60 תווים')
  }

  const companionVersion = (version || '').toString().trim()
  if (companionVersion && !COMPANION_VERSION_RE.test(companionVersion)) {
    throw new Error('גרסת התוכנה הנלווית יכולה להכיל אותיות, ספרות, נקודות, מקפים ופלוס בלבד')
  }

  return {
    present: true,
    name: companionName,
    version: companionVersion,
    platform: resolvedPlatform,
    fileName,
    ext,
    size,
    sha256: (sha256 || '').toString(),
    installsPlugin: installsPlugin === true
  }
}

// אובייקט רגיל מתוך תת-המסמך של מונגו (או null לתוסף רגיל). משמש למקור הנערך
// ולהעברה בין רשומות — למשל ארכוב הגרסה היוצאת להיסטוריה.
export function companionFromDoc(companion) {
  if (!companion?.present) return null
  return {
    present: true,
    name: companion.name || '',
    version: companion.version || '',
    platform: companion.platform || null,
    fileName: companion.fileName || '',
    ext: companion.ext || '',
    size: companion.size || 0,
    sha256: companion.sha256 || '',
    installsPlugin: companion.installsPlugin === true
  }
}

// הייצוג הציבורי. null לתוסף רגיל — כך שדף התוסף בודק שדה אחד בלבד.
// downloadUrl נבנה ע"י הקורא, כי בגרסה ארכיונית הוא נושא סיומת @version.
export function serializeCompanionForPublic(companion, { downloadUrl }) {
  if (!companion?.present) return null
  return {
    name: companion.name || '',
    version: companion.version || '',
    platform: companion.platform || null,
    platformLabel: companionPlatformLabel(companion.platform),
    fileName: companion.fileName || '',
    size: companion.size || 0,
    sha256: companion.sha256 || '',
    // המתקין מתקין בעצמו גם את קובץ התוסף (כמו ה-setup של חברותא, שמריץ את
    // ה-.otzplugin בסופו) — ואז דף התוסף מציג צעד אחד ולא שניים.
    installsPlugin: companion.installsPlugin === true,
    downloadUrl
  }
}
