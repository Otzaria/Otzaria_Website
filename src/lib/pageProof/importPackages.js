import path from 'path';
import fs from 'fs-extra';
import sharp from 'sharp';
import PageProofBook from '@/models/PageProofBook';
import PageProofPage from '@/models/PageProofPage';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { assignSequences, requiredFor, DEFAULT_DOUBLE_PCT } from './sequences.js';

// כתיבת חבילות-עמודים מפוענחות (packageParse) למסד ולדיסק. ייבוא-חוזר של
// אותו gid מוסיף עמודים ומעדכן עמודים שעוד איש לא נגע בהם; עמוד שיש לו
// הגשה (ממתינה או מאושרת) לא נדרס — הפעולות שהוגשו מתייחסות למזהי-השורות
// שלו, והחלפת התוכן הייתה מנתקת אותן.

export const IMAGE_ROOT = '/uploads/page-proof';

// JPEG באיכות גבוהה במידות המקור (הקואורדינטות בפיקסלים שלהן): PNG של
// סריקה בגווני-אפור שוקל פי 3–5, בלי תועלת להגהה
async function toJpeg(bytes) {
  const img = sharp(Buffer.from(bytes), { limitInputPixels: 30000 * 30000 });
  const meta = await img.metadata();
  const buffer = await img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  return { buffer, width: meta.width || 0, height: meta.height || 0 };
}

export async function importPackages(packages, entries, { userId, doublePct } = {}) {
  const summary = [];
  for (const pkg of packages) {
    const { gid, title, script } = pkg.meta;
    const res = { gid, title, created: 0, updated: 0, skippedAnswered: 0, errors: [] };

    let book = await PageProofBook.findOne({ gid });
    if (!book) {
      book = await PageProofBook.create({
        gid,
        title,
        script,
        doublePct: Number.isFinite(doublePct) ? doublePct : DEFAULT_DOUBLE_PCT,
        importedBy: userId || undefined,
      });
    }

    // הרצפים מחושבים על כל עמודי הספר (קיימים + חדשים), אבל נכתבים רק
    // לעמודים שעוד לא התחילו — רצף שכבר חולק למתנדב נשאר כמות-שהוא
    const existing = await PageProofPage.find({ book: book._id }, { page: 1, activeCount: 1, approvedCount: 1, leasedUntil: 1 }).lean();
    const existingBy = new Map(existing.map((p) => [p.page, p]));
    const seqOf = assignSequences([...existing.map((p) => p.page), ...pkg.pages.map((p) => p.doc.page)]);

    for (const { doc, imagePath } of pkg.pages) {
      const prev = existingBy.get(doc.page);
      if (prev && (prev.activeCount > 0 || prev.approvedCount > 0)) {
        res.skippedAnswered++;
        continue;
      }
      try {
        const img = await toJpeg(entries[imagePath]);
        if (img.width !== doc.size[0] || img.height !== doc.size[1]) {
          res.errors.push(`עמוד ${doc.page}: מידות התמונה (${img.width}×${img.height}) שונות מ-size שבעמוד (${doc.size.join('×')})`);
          continue;
        }
        const rel = `${IMAGE_ROOT}/${gid}/p${String(doc.page).padStart(4, '0')}.jpg`;
        const fsPath = resolveImageFsPath(rel);
        await fs.ensureDir(path.dirname(fsPath));
        await fs.writeFile(fsPath, img.buffer);

        const seq = seqOf.get(doc.page);
        await PageProofPage.updateOne(
          { gid, page: doc.page },
          {
            $set: {
              book: book._id,
              seq,
              doc,
              lineCount: doc.lines.length,
              imagePath: rel,
              imageWidth: img.width,
              imageHeight: img.height,
              required: requiredFor(gid, seq, book.doublePct),
            },
            $setOnInsert: { activeCount: 0, approvedCount: 0, submitters: [], status: 'open' },
          },
          { upsert: true }
        );
        if (prev) res.updated++;
        else res.created++;
      } catch (e) {
        res.errors.push(`עמוד ${doc.page}: ${e.message}`);
      }
    }

    // מונים של הספר — מחושבים מחדש מהמסד (ייבוא חלקי/חוזר)
    const agg = await PageProofPage.aggregate([
      { $match: { book: book._id } },
      { $group: { _id: null, pages: { $sum: 1 }, lines: { $sum: '$lineCount' } } },
    ]);
    await PageProofBook.updateOne(
      { _id: book._id },
      { $set: { pageCount: agg[0]?.pages || 0, lineCount: agg[0]?.lines || 0, lastImportAt: new Date() } }
    );
    summary.push(res);
  }
  return summary;
}
