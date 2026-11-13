// ספירות העמודים של ספר לקראת OCR לספר שלם (חלון ההפעלה ונתיב start) — ראו countOcrPages.
// opts: range — toProcess רק בטווח העמודים (נתיב start); withRuns — גם toProcessRuns ו-maxPageNumber
// (נתיב status — הטופס סופר מהם לפי הטווח שנבחר).
import Page from '../../models/Page.js';
import { countOcrPages, selectionView } from './runOcrJob.pure.js';

export async function countBookOcrPages(bookId, { range = null, withRuns = false } = {}) {
  const pages = [];
  const cursor = Page.find({ book: bookId })
    .select('pageNumber imagePath content rightColumn leftColumn status contentSaveRevision lastOcrTextSha256 lastOcrAt updatedAt')
    .lean()
    .cursor();
  // הטקסט עצמו לא נשמר בזיכרון — selectionView נותן אותן תשובות
  for await (const p of cursor) pages.push({ ...selectionView(p), imagePath: p.imagePath, pageNumber: p.pageNumber });
  return countOcrPages(pages, { range, withRuns });
}
