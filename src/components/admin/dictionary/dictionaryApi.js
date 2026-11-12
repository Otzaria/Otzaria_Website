// הבקשות של "הצעות למילון" — אותה נקודת קצה, אותן שיטות ואותם גופים בדיוק כמו המסך הקודם (בלי שינוי בחוזה):
// GET /api/admin/dictionary, ו-POST עם { action, userId, word } לכל זוג משתמש–מילה. העטיפה (adminRequest) מוסיפה:
// התחברות שפגה מזוהה, תקרת זמן, והודעת שגיאה בעברית.
import { requestJson } from '@/components/admin/list/adminRequest'

/** @returns {Promise<{ entries: any[], skipped: any[] }>} */
export async function loadDictionary() {
  const data = await requestJson('/api/admin/dictionary', { fallback: 'לא הצלחנו לטעון את ההצעות למילון.' })
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    skipped: Array.isArray(data.skipped) ? data.skipped : [],
  }
}

/**
 * @param {{ action: string, userId: string, word: string }} request
 * @param {{ keepalive?: boolean }} [options] keepalive — בסגירת הדף (useDeferredActions)
 */
export const sendWordRequest = ({ action, userId, word }, { keepalive = false } = {}) => requestJson('/api/admin/dictionary', {
  method: 'POST',
  body: { action, userId, word },
  fallback: 'לא הצלחנו לעדכן את המילה.',
  keepalive,
})
