// גיבוי מלא (GET /api/admin/export-backup) — מי רואה את "הורד גיבוי" בממשק. לוגיקה טהורה (נבדק ב-adminBackup.test.mjs).
//
// בדיוק כמו לפני העיצוב החדש: לפי שם המשתמש בלבד (name === 'admin'). השרת בודק בנוסף isAdmin (מנהל כללי) — החלטת
// המשתמש היא לא לשנות את מי שרואה את הכפתור.

export const BACKUP_URL = '/api/admin/export-backup'

/** @param {{ name?: string, role?: string } | null | undefined} user */
export function canDownloadBackup(user) {
  return user?.name === 'admin'
}

export const BACKUP_TEXT = {
  title: 'להוריד גיבוי?',
  confirm: 'הורד גיבוי',
}
