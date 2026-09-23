// הפלטפורמות שאפשר להצהיר עליהן כמערכת ההפעלה של התוכנה הנלווית, והסיומות
// שמקובלות כמתקין בכל אחת. מקור אמת יחיד לשרת (pluginCompanion.js) ולטפסים
// בדפדפן — ולכן הקובץ נטול imports לגמרי, כדי שייבוא מרכיב 'use client' לא
// יגרור איתו תלות צד-שרת כלשהי.
export const COMPANION_PLATFORMS = {
  windows: { label: 'Windows', extensions: ['.exe', '.msi'] },
  linux: { label: 'Linux', extensions: ['.appimage', '.deb', '.rpm', '.sh'] },
  macos: { label: 'macOS', extensions: ['.dmg', '.pkg'] }
}

export const COMPANION_PLATFORM_KEYS = Object.keys(COMPANION_PLATFORMS)

export function companionPlatformLabel(platform) {
  return COMPANION_PLATFORMS[platform]?.label || ''
}

export function companionPlatformExtensions(platform) {
  return COMPANION_PLATFORMS[platform]?.extensions || []
}

// הסיומת (כולל נקודה, באותיות קטנות) של שם קובץ — ללא path, כדי שיעבוד בדפדפן.
// שם שמתחיל בנקודה ואין בו נקודה נוספת (".bashrc") נחשב ללא סיומת, כמו ב-path.extname.
export function companionExtOf(fileName) {
  const base = (fileName || '').toString().split(/[\\/]/).pop() || ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot).toLowerCase() : ''
}

// מערכת ההפעלה שממנה גולשים — רק כדי לומר למי שגולש מטלפון או ממחשב אחר שהמתקין
// אינו בשבילו. הסדר חשוב: אנדרואיד מדווח "Linux", ו-iOS מדווח "like Mac OS X".
export function detectViewerPlatform(userAgent) {
  const ua = (userAgent || '').toString()
  if (/Android/i.test(ua)) return 'other'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'other'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  if (/Linux|X11/i.test(ua)) return 'linux'
  return 'other'
}
