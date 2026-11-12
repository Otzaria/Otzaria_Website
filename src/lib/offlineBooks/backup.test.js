import { test, expect, vi } from 'vitest' // כלי הבדיקה וההדמיה.
import { parseBackup, restoreBackup } from './backup' // בדיקת הפענוח והשחזור.
import { pageKey, readRecord, writeRecord } from './store' // גישה לרשומה המקומית.
const target = { userId: 'u', bookPath: 'book', pageNumber: 1 }
const data = { content: 'טקסט', leftColumn: 'שמאל', rightColumn: 'ימין', rightColumnName: 'פנים', leftColumnName: 'פירוש', twoColumns: true }
const backup = { version: 1, user: { id: 'u' }, bookPath: 'book', pageNumber: 1, baseVersion: 'a'.repeat(64), draft: data }
test('restores both columns, names and the original conflict baseline, without importing account/session fields', () => {
  expect(parseBackup(JSON.stringify({ ...backup, draft: { ...data, expectedUserId: 'attacker' } }), target)).toEqual({ baseVersion: backup.baseVersion, data: { ...data, bookPath: 'book', pageNumber: 1, ocrWordReview: null } })
})
test.each([{ userId: 'other' }, { bookPath: 'other' }, { pageNumber: 2 }])('refuses a backup for another account or page: %j', patch => {
  expect(() => parseBackup(JSON.stringify(backup), { ...target, ...patch })).toThrow()
})
test('refuses truncated data and malformed review metadata', () => {
  expect(() => parseBackup('{', target)).toThrow()
  expect(() => parseBackup(JSON.stringify({ ...backup, draft: { content: '' } }), target)).toThrow()
  expect(() => parseBackup(JSON.stringify({ ...backup, draft: { ...data, ocrWordReview: {} } }), target)).toThrow()
})

test('restore refuses a running or unresolved sync and preserves its receipt', async () => { // מונעים מחיקת בקשה שתוצאתה לא ידועה.
  localStorage.clear() // מתחילים ללא נתונים קודמים.
  const key = pageKey('u', 'book', 1) // מזהים את העמוד המקומי.
  const flight = { draft: { ...data, offlineSaveId: 'request' }, baseVersion: 'b'.repeat(64) } // מדמים בקשה שנשלחה.
  const record = { version: 1, key, user: { id: 'u' }, bookPath: 'book', pageNumber: 1, book: { name: 'book' }, data, draft: data, baseVersion: flight.baseVersion, inFlight: flight } // שומרים את כל פרטי הניסיון.
  writeRecord(record) // מפרסמים את הרשומה לבדיקה.
  const request = vi.fn(async (_name, _options, callback) => callback(null)) // מדמים נעילה שנתפסת בידי סנכרון פעיל.
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }) // מחליפים את שירות הנעילות לבדיקה.
  try { // מבטיחים ניקוי גם במקרה של כישלון.
    await expect(restoreBackup(key, { data, baseVersion: backup.baseVersion })).rejects.toThrow('הסנכרון מתבצע') // שחזור מקביל נדחה.
    request.mockImplementation(async (_name, _options, callback) => callback({})) // הנעילה פנויה אך תוצאת הבקשה עדיין לא ידועה.
    await expect(restoreBackup(key, { data, baseVersion: backup.baseVersion })).rejects.toThrow('אינה ידועה') // גם במקרה הזה השחזור נדחה.
    expect(readRecord(key)).toEqual(record) // הטיוטה ופרטי הניסיון נשארים ללא שינוי.
    writeRecord({ ...record, inFlight: null }) // מדמים פתרון של הבקשה הקודמת.
    await restoreBackup(key, { data, baseVersion: backup.baseVersion }) // כעת ניתן לשחזר.
    expect(readRecord(key)).toMatchObject({ baseVersion: backup.baseVersion, draft: { content: data.content }, inFlight: null }) // נשמרת גרסת הבסיס של הגיבוי.
  } finally { // מנקים את המצב שנוצר בבדיקה.
    delete navigator.locks // משחזרים את הגדרת סביבת הבדיקה.
    localStorage.clear() // מסירים רשומות זמניות.
  } // מסיימים את הניקוי.
}) // מסיימים את בדיקת השחזור.
