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
export function restoreBackup(key, backup) {
  const current = readRecord(key)
  if (!current) throw new Error('יש להכין עותק אופליין לפני השחזור')
  // A single atomic journal replacement: quota failure cannot delete the previous draft.
  writeRecord({ ...current, baseVersion: backup.baseVersion, inFlight: null, problem: null,
    draft: { ...backup.data, offlineSaveId: crypto.randomUUID(), saveRevision: Math.max(Date.now() * 1000,
      (current.data.saveRevision || 0) + 1, (current.draft?.saveRevision || 0) + 1) } })
}
