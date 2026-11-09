import { test, expect } from 'vitest'
import { parseBackup } from './backup'
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
