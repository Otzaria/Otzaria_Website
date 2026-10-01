// קבועי סטטוס/תאימות של תוסף — מודול טהור ובטוח-ללקוח (ללא ייבוא של
// path/zlib/fs או של מודולים שמייבאים אותם).
//
// למה קובץ נפרד: רכיבי 'use client' (כרטיס תוסף, דף תוסף, חיפוש, העלאה, חלון
// העריכה) צריכים רק את התוויות ואת גרסת המינימום. כשהם ייבאו אותם מ-
// pluginSubmission.js, ה-bundler משך איתם גם את 'path' ואת שרשרת
// pluginCompatibility → pluginManifest → 'zlib', כלומר ~60KB gz של polyfills
// (browserify-zlib, stream, assert, util, buffer) בכל דף בחנות התוספים.
// pluginSubmission.js ממשיך לייצא את אותם שמות (re-export) לקוד השרת.

export const ALLOWED_PLUGIN_STATUSES = ['stable', 'beta', 'experimental']

export const PLUGIN_STATUS_LABELS = {
  stable: 'יציב',
  beta: 'בטא',
  experimental: 'ניסיוני'
}

export const MIN_SUPPORTED_APP_VERSION = '0.9.89'

export function formatPluginStatus(status) {
  return PLUGIN_STATUS_LABELS[status] || 'לא ידוע'
}
