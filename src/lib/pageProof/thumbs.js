import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
// נתיב יחסי (לא '@/') — כדי שהטסט (thumbs.test.mjs) ירוץ עם node:test
import { readPageImage, resolveImageFsPath } from '../ocr/images.js';

// תמונה ממוזערת של עמוד להגהה — לכרטיסי רשת-העמודים ולרשימת הספרים.
// הסריקה המלאה שוקלת מאות KB ויותר; ברשת של מאות עמודים זה לא סביר.
// הממוזערת נשמרת בדיסק (מתחת ל-page-proof/, שחסום כנכס סטטי — מוגשת רק
// דרך /api/page-proof/pages/[id]/thumb) ונוצרת מחדש כשתמונת-העמוד חדשה ממנה
// (ייבוא-חוזר או עמוד שחזר מזיהוי-מחדש כותבים את תמונת-העמוד מחדש).

export const THUMB_WIDTH = 360;
export const THUMB_DIR = '/uploads/page-proof/thumbs';

export const thumbPath = (pageId) => `${THUMB_DIR}/${pageId}.jpg`;

async function render(imagePath) {
  const { buffer } = await readPageImage(imagePath);
  return sharp(buffer, { limitInputPixels: 30000 * 30000 })
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

// מחיקת הממוזערות של עמודים (למשל במחיקת ספר — הן לא בתיקיית הספר).
// ממוזערת שלא קיימת — מדולגת. ← כמה נמחקו
export async function removeThumbs(pageIds) {
  let removed = 0;
  for (const id of pageIds || []) {
    const file = resolveImageFsPath(thumbPath(String(id)));
    try {
      await fs.rm(file);
      removed++;
    } catch (e) {
      if (e?.code !== 'ENOENT') throw e;
    }
  }
  return removed;
}

// pageId — מזהה העמוד (ObjectId שכבר נבדק בראוט); imagePath — כמו במסד.
// ← Buffer של JPEG
export async function pageThumb(pageId, imagePath) {
  const src = resolveImageFsPath(imagePath);
  const dst = resolveImageFsPath(thumbPath(pageId));
  const [srcStat, dstStat] = await Promise.all([fs.stat(src), fs.stat(dst).catch(() => null)]);
  if (dstStat && dstStat.mtimeMs >= srcStat.mtimeMs) {
    try {
      return await fs.readFile(dst);
    } catch {
      // נמחקה בינתיים — ניצור מחדש
    }
  }

  const thumb = await render(imagePath);
  // כתיבה לקובץ זמני ואז החלפה — בקשה מקבילה לא תקרא קובץ חצי-כתוב
  await fs.mkdir(path.dirname(dst), { recursive: true });
  const tmp = `${dst}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, thumb);
  try {
    await fs.rename(tmp, dst);
  } catch {
    // (Windows: היעד פתוח בקריאה מקבילה) — הממוזערת שכבר שם תקינה
    await fs.rm(tmp, { force: true });
  }
  return thumb;
}
