// הבקשות של "פרטי ספרים" — אותן נקודות קצה, אותן שיטות ואותם גופים בדיוק כמו המסך הקודם (בלי שינוי בחוזה):
//   GET  /api/admin/book-info/change-sets?active=…&cursor=…   (cache: 'no-store', כמו קודם)
//   GET  /api/admin/book-info/pending                         (cache: 'no-store')
//   POST /api/admin/book-info/pending  { action: 'publish' | 'delete', selections: [{ changeId, fields }] }
// העטיפה (adminRequest.send) מוסיפה: התחברות שפגה מזוהה, תקרת זמן, והודעת שגיאה בעברית.
import { requestBlob, requestJson } from '@/components/admin/list/adminRequest'
import { changeSetsUrl } from '@/lib/adminBookInfoScreen/bookInfoQuery'
import { EXPORT_CSV_URL } from '@/lib/adminBookInfoScreen/bookInfoTerms'

const getJson = (url, fallback) => requestJson(url, { fallback, cache: 'no-store' })

/** @returns {Promise<{ rows: any[], nextCursor: string | null }>} */
export async function listChangeSets(view, cursor) {
  const data = await getJson(changeSetsUrl(view, cursor), 'לא הצלחנו לטעון את בקשות המיזוג.')
  return { rows: Array.isArray(data.rows) ? data.rows : [], nextCursor: data.nextCursor || null }
}

/** @returns {Promise<any[]>} */
export async function listLegacy() {
  const data = await getJson('/api/admin/book-info/pending', 'לא הצלחנו לטעון את ההצעות הישנות.')
  return Array.isArray(data.rows) ? data.rows : []
}

/**
 * פתיחת בקשת מיזוג (publish — הצעה אחת בכל בקשה, כמו קודם) או מחיקה (delete — כמה יחד).
 * publish פותח את הבקשה ב-GitHub — עד שתי דקות בשרת (maxDuration), ולכן תקרת זמן ארוכה.
 * @param {'publish' | 'delete'} action @param {{ changeId: string, fields: string[] }[]} selections
 * @param {{ keepalive?: boolean }} [options] keepalive — בסגירת הדף (useDeferredActions)
 */
export const postLegacy = (action, selections, { keepalive = false } = {}) => requestJson('/api/admin/book-info/pending', {
  method: 'POST',
  body: { action, selections },
  fallback: action === 'publish' ? 'לא הצלחנו לפתוח את בקשת המיזוג.' : 'לא הצלחנו למחוק את ההצעה.',
  timeoutMs: action === 'publish' ? 130000 : undefined,
  keepalive,
})

/** הורדת book_info.csv (GET /api/admin/book-info/export-csv, כמו הקישור הקודם) — הייצוא קורא מ-GitHub, ולכן תקרת זמן ארוכה */
export const downloadBookInfoCsv = () => requestBlob(EXPORT_CSV_URL, { fallback: 'לא הצלחנו להוריד את הקובץ.', timeoutMs: 90000 })
