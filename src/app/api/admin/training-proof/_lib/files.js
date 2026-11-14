import fs from 'fs-extra';
import TrainingProofItem from '@/models/TrainingProofItem';
import TrainingProofPackage from '@/models/TrainingProofPackage';
import TrainingProofBook from '@/models/TrainingProofBook';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { TP_IMAGE_ROOT, packageDirRel } from '@/lib/trainingProof/storage';

// מחיקת קבצים וניקוי אחרי מחיקת פריטים (הורדה לתחנה — ה-13; מחיקת חבילה בהעלאה).
// רק בתוך תיקיית ההגהה לאימון — לעולם לא נוגעים בתמונות אחרות של האתר.

const inRoot = (rel) => typeof rel === 'string' && rel.startsWith(`${TP_IMAGE_ROOT}/`);

async function removeRel(rel) {
  if (!inRoot(rel)) return false;
  try {
    await fs.remove(resolveImageFsPath(rel));
    return true;
  } catch {
    return false;
  }
}

// docs — הפריטים שנמחקו (עם imagePath/ctxPath). תמונת-השורה שלהם נמחקת; תמונת-הקשר
// נמחקת רק כשאין עוד פריט שמשתמש בה. מחזיר כמה קבצים נמחקו
export async function removeItemFiles(docs) {
  let n = 0;
  for (const rel of new Set(docs.map((d) => d.imagePath).filter(inRoot))) {
    if (await TrainingProofItem.exists({ imagePath: rel })) continue;
    if (await removeRel(rel)) n++;
  }
  const ctx = [...new Set(docs.map((d) => d.ctxPath).filter(inRoot))];
  for (const rel of ctx) {
    if (await TrainingProofItem.exists({ ctxPath: rel })) continue;
    if (await removeRel(rel)) n++;
  }
  return n;
}

// Deletes with the condition re-checked atomically for every document and only
// removes files belonging to documents that MongoDB actually deleted. A state
// transition between the initial scan and deletion therefore cannot orphan a
// live item from its image.
export async function deleteMatchingItems(filter, projection = {}, { removeFiles = true } = {}) {
  const candidates = await TrainingProofItem.find(filter, projection).lean();
  const deleted = [];
  const batchSize = 50;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const rows = await Promise.all(
      candidates.slice(i, i + batchSize).map((candidate) =>
        TrainingProofItem.findOneAndDelete({ ...filter, _id: candidate._id }, { projection, lean: true })
      )
    );
    deleted.push(...rows.filter(Boolean));
  }
  const files = removeFiles ? await removeItemFiles(deleted) : 0;
  return { deleted, files };
}

// חבילות שלא נשאר בהן פריט נמחקות; תיקיית-התמונות של package_id נמחקת כשלא נשאר
// לו אף חלק. keys — [{packageId, part}]. מחזיר את מה שנמחק
export async function dropEmptyPackages(keys) {
  const dropped = [];
  const uniq = [...new Map(keys.map((k) => [`${k.packageId}#${k.part}`, k])).values()];
  for (const { packageId, part } of uniq) {
    if (await TrainingProofItem.exists({ packageId, part })) continue;
    await TrainingProofPackage.deleteOne({ packageId, part });
    dropped.push({ packageId, part });
  }
  for (const packageId of new Set(dropped.map((d) => d.packageId))) {
    if (await TrainingProofItem.exists({ packageId })) continue;
    if (await TrainingProofPackage.exists({ packageId })) continue;
    await fs.remove(resolveImageFsPath(packageDirRel(packageId))).catch(() => {});
  }
  return dropped;
}

// ספרי-גלאי שלא נשאר להם עמוד באתר נמחקים מרשימת הספרים
export async function dropEmptyBooks(books) {
  let n = 0;
  for (const book of new Set(books.filter(Boolean))) {
    if (await TrainingProofItem.exists({ section: 'frames', book })) continue;
    n += (await TrainingProofBook.deleteOne({ book })).deletedCount;
  }
  return n;
}
