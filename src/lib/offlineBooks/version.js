import { createHash } from 'node:crypto'

// Guard actual values, including writes by old clients and OCR jobs which do not bump a counter.
export const VERSION_FIELDS = [
  'content', 'isTwoColumns', 'rightColumn', 'leftColumn', 'rightColumnName', 'leftColumnName',
  'contentSaveRevision', 'ocrWordReview', 'imagePath', 'lastOcrJobId', 'lastOcrResultSha256',
  'lastOcrTextSha256', 'lastOcrAt',
]
export function pageVersion(page) {
  return createHash('sha256').update(JSON.stringify(VERSION_FIELDS.map(key => page[key] ?? null), (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)).digest('hex')
}
export function pageVersionGuard(page) {
  return Object.fromEntries([...VERSION_FIELDS, 'status', 'claimedBy'].map(key => [key, page[key] ?? null]))
}
export function sameSavedText(page, body) {
  return ['content', 'rightColumn', 'leftColumn', 'rightColumnName', 'leftColumnName'].every(key =>
    page[key] === body[key]) && page.isTwoColumns === body.twoColumns && page.contentSaveRevision === body.saveRevision
}
