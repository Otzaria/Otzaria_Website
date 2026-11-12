// הבקשות של "התנגשויות בסנכרון" — אותן נקודות קצה, אותן שיטות ואותם גופים בדיוק כמו המסך הקודם (בלי
// שינוי בחוזה). העטיפה (adminRequest) מוסיפה: התחברות שפגה מזוהה, תקרת זמן, והודעת שגיאה בעברית.
import { requestJson } from '@/components/admin/list/adminRequest'
import { CONFLICT_RETRY_MESSAGE } from '@/lib/adminSuggestions/conflictTerms'

/** 409 ("עומס עדכונים מקבילים על הספר") — במילים פשוטות */
async function friendly(promise) {
  try {
    return await promise
  } catch (error) {
    if (error?.status === 409) error.message = CONFLICT_RETRY_MESSAGE
    throw error
  }
}

export const listConflicts = () => requestJson('/api/library/conflicts', { fallback: 'לא הצלחנו לטעון את הספרים.' })

export const loadConflictDiff = (bookId) => requestJson(`/api/library/books/${bookId}/conflict-diff`, {
  fallback: 'לא הצלחנו לטעון את ההבדלים.',
})

/** חלק אחד: לפי התוכן המלא שלו (fullBefore / fullAfter), כמו קודם */
export const resolveConflictPart = (bookId, change, strategy) => friendly(requestJson(`/api/library/books/${bookId}/resolve-conflict-hunk`, {
  method: 'POST',
  body: { before: change.fullBefore, after: change.fullAfter, strategy },
  fallback: 'לא הצלחנו לשמור את הבחירה.',
}))

export const resolveConflictBook = (bookId, strategy) => friendly(requestJson(`/api/library/books/${bookId}/resolve-conflict`, {
  method: 'POST',
  body: { strategy },
  fallback: 'לא הצלחנו לעדכן את הספר.',
  timeoutMs: 60000,
}))
