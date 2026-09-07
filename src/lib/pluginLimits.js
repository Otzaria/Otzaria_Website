// מגבלות גודל/כמות/פורמט של קבצי תוסף — משותף בין הלקוח (בדיקה מקדימה
// בדף העלאת תוסף) לשרת (src/lib/pluginStorage.js, שמייבא ומייצא מחדש
// מכאן). קובץ js טהור בלי תלויות node (fs/path/crypto), כדי שיהיה ניתן
// לייבא גם מרכיב 'use client' בלי לשבור את ה-bundle.

export const MAX_PLUGIN_BYTES = 50 * 1024 * 1024 // 50MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024   // 5MB
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
export const MAX_SCREENSHOTS = 10

// סוגי תמונה מותרים (whitelist)
export const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
