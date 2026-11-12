import { validOcrReviewState } from '../editor/ocrReviewState'
import { pageKey, readRecord, writeRecord } from './store'

export function parseBackup(text, { userId, bookPath, pageNumber }) {
  if (text.length > 20_000_000) throw new Error('קובץ הגיבוי גדול מדי')
  let backup = JSON.parse(text)
  const key = pageKey(userId, bookPath, pageNumber)
  if (backup.copies?.[key]) backup = JSON.parse(backup.copies[key])
  if (backup.version !== 1 || backup.user?.id !== String(userId) || backup.bookPath !== bookPath ||
      backup.pageNumber !== pageNumber || !/^[a-f0-9]{64}$/.test(backup.baseVersion)) {
    throw new Error('הגיבוי אינו תואם לחשבון ולעמוד הנוכחיים')
  }
  const source = backup.draft || backup.data
  const fields = ['content', 'leftColumn', 'rightColumn', 'rightColumnName', 'leftColumnName']
  if (!source || !fields.every(key => typeof source[key] === 'string') || typeof source.twoColumns !== 'boolean' ||
      (source.ocrWordReview != null && !validOcrReviewState(source.ocrWordReview))) throw new Error('תוכן הגיבוי אינו תקין')
  return { baseVersion: backup.baseVersion, data: { ...Object.fromEntries(fields.map(key => [key, source[key]])),
    bookPath, pageNumber, twoColumns: source.twoColumns, ocrWordReview: source.ocrWordReview || null } }
}
export async function restoreBackup(key, backup) {
  if (!navigator.locks) throw new Error('הדפדפן אינו מאפשר שחזור בטוח') // ללא נעילה לא משחזרים במקביל לסנכרון.
  return navigator.locks.request(`sync:${key}`, { ifAvailable: true }, async lock => { // משתמשים באותה נעילה כמו הסנכרון.
    if (!lock) throw new Error('הסנכרון מתבצע כעת. נסו לשחזר שוב לאחר שיסתיים.') // אין לשנות טיוטה במהלך בקשה.
    const current = readRecord(key) // קוראים מחדש אחרי קבלת הנעילה.
    if (!current) throw new Error('יש להכין עותק אופליין לפני השחזור') // אין לשחזר לעותק שהוסר.
    if (current.inFlight) throw new Error('תוצאת הסנכרון הקודם אינה ידועה. השלימו סנכרון לפני השחזור.') // שומרים את מזהה הניסיון עד לפתרון.
    writeRecord({ ...current, baseVersion: backup.baseVersion, problem: null, // השחזור נשאר מותנה בגרסת הבסיס המקורית.
      draft: { ...backup.data, offlineSaveId: crypto.randomUUID(), saveRevision: Math.max(Date.now() * 1000, // יוצרים מזהה שמירה חדש.
        (current.data.saveRevision || 0) + 1, (current.draft?.saveRevision || 0) + 1) } }) // שומרים מונה עולה.
  }) // משחררים את הנעילה בסיום.
}
