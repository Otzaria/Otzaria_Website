// מגבלות גודל/כמות/פורמט של קבצי תוסף — משותף בין הלקוח (בדיקה מקדימה
// בדף העלאת תוסף) לשרת (src/lib/pluginStorage.js, שמייבא ומייצא מחדש
// מכאן). קובץ js טהור בלי תלויות node (fs/path/crypto), כדי שיהיה ניתן
// לייבא גם מרכיב 'use client' בלי לשבור את ה-bundle.

export const MAX_PLUGIN_BYTES = 50 * 1024 * 1024 // 50MB
// ZIP limits apply to every entry, including assets that validation doesn't scan.
export const MAX_PLUGIN_ENTRIES = 1024
export const MAX_PLUGIN_EXPANDED_BYTES = 150 * 1024 * 1024
export const MAX_PLUGIN_ENTRY_BYTES = 50 * 1024 * 1024
export const MAX_PLUGIN_CODE_BYTES = 16 * 1024 * 1024
export const MAX_PLUGIN_MANIFEST_BYTES = 256 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024   // 5MB
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
export const MAX_SCREENSHOTS = 10

// סוגי תמונה מותרים (whitelist)
export const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
