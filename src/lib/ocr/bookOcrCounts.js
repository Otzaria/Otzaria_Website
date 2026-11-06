// ספירות העמודים של ספר לקראת OCR לספר שלם (חלון ההפעלה ונתיב start) — ראו countOcrPages.
import Page from '../../models/Page.js';
import { countOcrPages, selectionView } from './runOcrJob.pure.js';

export async function countBookOcrPages(bookId) {
  const pages = [];
  const cursor = Page.find({ book: bookId })
    .select('imagePath content rightColumn leftColumn status contentSaveRevision lastOcrTextSha256 lastOcrAt updatedAt')
    .lean()
    .cursor();
  // הטקסט עצמו לא נשמר בזיכרון — selectionView נותן אותן תשובות
  for await (const p of cursor) pages.push({ ...selectionView(p), imagePath: p.imagePath });
  return countOcrPages(pages);
}
