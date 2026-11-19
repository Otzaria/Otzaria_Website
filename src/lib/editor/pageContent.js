import { pageVersion } from '@/lib/offlineBooks/version'
import { ocrReviewRevision } from '@/lib/editor/ocrReviewState'

// משותף לטעינה הראשונית ולהכנת עמודים לאופליין. גרסת התוכן מחושבת מאותם שדות גם בעת שמירה.
export function formatEditorPageContent(page) {
  const revision = ocrReviewRevision(page)
  return {
    contentVersion: pageVersion(page),
    saveRevision: page.contentSaveRevision || 0,
    thumbnail: page.imagePath,
    id: page._id,
    content: page.content || '',
    isTwoColumns: page.isTwoColumns || false,
    twoColumns: page.isTwoColumns || false,
    rightColumn: page.rightColumn || '',
    leftColumn: page.leftColumn || '',
    rightColumnName: page.rightColumnName || 'חלק 1',
    leftColumnName: page.leftColumnName || 'חלק 2',
    status: page.status,
    claimedBy: page.claimedBy,
    ocrReviewRevision: revision,
    ocrWordReview: page.ocrWordReview?.revision === revision ? page.ocrWordReview : null,
  }
}
