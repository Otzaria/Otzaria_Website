// מגבלות גודל/כמות/פורמט של קבצי תוסף — משותף בין הלקוח (בדיקה מקדימה
// בדף העלאת תוסף) לשרת (src/lib/pluginStorage.js, שמייבא ומייצא מחדש
// מכאן). קובץ js טהור בלי תלויות node (fs/path/crypto), כדי שיהיה ניתן
// לייבא גם מרכיב 'use client' בלי לשבור את ה-bundle.

export const MAX_PLUGIN_BYTES = 50 * 1024 * 1024 // 50MB
// מתקין של תוכנה נלווית — מגבלה נפרדת וגבוהה יותר מהתוסף: מתקין שולחני נושא
// בינארי מקומפל, ולפעמים גם runtime (ראו src/lib/pluginCompanion.js).
export const MAX_COMPANION_BYTES = 150 * 1024 * 1024 // 150MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024   // 5MB
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
export const MAX_SCREENSHOTS = 10

// סוגי תמונה מותרים (whitelist)
export const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
