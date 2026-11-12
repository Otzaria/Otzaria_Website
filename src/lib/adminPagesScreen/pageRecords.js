export const PAGE_METADATA = '_id book pageNumber status claimedBy claimedAt updatedAt completedAt createdAt'
export const PAGE_TEXT_FIELDS = 'content isTwoColumns rightColumn leftColumn rightColumnName leftColumnName'

export function formatPageRecord(page, bookName, workerName) {
  return {
    id: String(page._id),
    bookName: bookName || 'ספר לא ידוע',
    number: page.pageNumber,
    status: page.status,
    claimedBy: workerName ?? null,
    claimedById: page.claimedBy ? String(page.claimedBy) : null,
    claimedAt: page.claimedAt ?? null,
    updatedAt: page.updatedAt ?? null,
    completedAt: page.completedAt,
    createdAt: page.createdAt,
  }
}

export function formatPageText(page) {
  return page.isTwoColumns
    ? `--- ${page.rightColumnName ?? 'חלק 1'} ---\n${page.rightColumn || ''}\n\n--- ${page.leftColumnName ?? 'חלק 2'} ---\n${page.leftColumn || ''}`
    : page.content || ''
}
