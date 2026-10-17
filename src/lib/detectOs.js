// זיהוי מערכת ההפעלה של המבקר — לוגיקה טהורה (בלי DOM), ושני מימושים שחייבים להסכים:
// - detectOs — לשימוש בקוד (נבדק ב-detectOs.test.mjs);
// - OS_DETECT_SCRIPT — אותו זיהוי כסקריפט inline קטן, שרץ ב-<head> (app/layout.tsx) לפני הציור
//   הראשון וכותב את התוצאה ל-<html data-os="...">. כך CSS יכול להציג את מה שמתאים למערכת כבר
//   בציור הראשון, בלי קפיצה אחרי ה-hydration, והדף עצמו נשאר זהה לכל המבקרים (מטמון CDN
//   ציבורי, בלי Vary: User-Agent). ES5 בכוונה: הוא לא עובר דרך ה-bundler.
//   הטסט מריץ את הסקריפט מול אותם מקרים של detectOs, כדי ששני המימושים לא ייפרדו.

/** הערכים האפשריים של data-os */
export const OS_VALUES = ['windows', 'macos', 'mobile', 'other']

/**
 * מחזיר 'windows' | 'macos' — מחשב; 'mobile' — טלפון/טאבלט; 'other' — מחשב אחר (Linux,
 * ChromeOS); null — לא ידוע. iPadOS מתחזה ל-Mac ב-userAgent, ומזוהה לפי maxTouchPoints.
 */
export function detectOs({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ua = userAgent.toLowerCase()
  const pf = platform.toLowerCase()
  if (/android|iphone|ipad|ipod/.test(ua)) return 'mobile'
  if (/mac/.test(pf) || /macintosh/.test(ua)) return maxTouchPoints > 1 ? 'mobile' : 'macos'
  if (/win/.test(pf) || /windows/.test(ua)) return 'windows'
  if (/linux|cros|x11/.test(pf) || /linux|cros|x11/.test(ua)) return 'other'
  return null
}

/**
 * הפלטפורמה של אפליקציית אוצריא שמתאימה למבקר — לאזור ההורדה בדף הבית (DownloadSectionClient),
 * שמציע כרטיס לכל אחת: 'android' | 'ios' | 'macos' | 'windows' | 'linux', או null — לא ידוע.
 * גס יותר מ-detectOs בכוונה (כמו שהיה ברכיב): iPad שמתחזה ל-Mac נחשב macOS, ו-ChromeOS — לא ידוע.
 */
export function detectPlatform({ userAgent = '', platform = '' } = {}) {
  const ua = userAgent.toLowerCase()
  const pf = platform.toLowerCase()
  if (/android/.test(ua)) return 'android'
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/mac/.test(pf) || /macintosh/.test(ua)) return 'macos'
  if (/win/.test(pf) || /windows/.test(ua)) return 'windows'
  if (/linux/.test(pf) || /linux/.test(ua)) return 'linux'
  return null
}

/** הערך שהסקריפט כתב על <html> (או null — בשרת, לפני הסקריפט, או ערך לא מוכר) */
export function readDocumentOs(doc) {
  const value = doc?.documentElement?.getAttribute('data-os')
  return OS_VALUES.includes(value) ? value : null
}

export const OS_DETECT_SCRIPT =
  "(function(){try{var n=navigator,u=(n.userAgent||'').toLowerCase(),p=(n.platform||'').toLowerCase(),o=null;" +
  "if(/android|iphone|ipad|ipod/.test(u))o='mobile';" +
  "else if(/mac/.test(p)||/macintosh/.test(u))o=(n.maxTouchPoints||0)>1?'mobile':'macos';" +
  "else if(/win/.test(p)||/windows/.test(u))o='windows';" +
  "else if(/linux|cros|x11/.test(p)||/linux|cros|x11/.test(u))o='other';" +
  "if(o)document.documentElement.setAttribute('data-os',o)}catch(e){}})()"
