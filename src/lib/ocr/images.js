import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';

// שורש קבצי ההעלאה - חייב להיות זהה לזה שב-/api/admin/books/upload.
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads'));

// ממיר נתיב תמונה כפי שנשמר ב-DB (למשל /uploads/books/<slug>/page.1.jpg)
// לנתיב מערכת-קבצים אמיתי תחת UPLOAD_ROOT, עם אימות מפני Path Traversal.
export function resolveImageFsPath(imagePath) {
  const rel = String(imagePath || '').replace(/^\/?uploads\//, ''); // UPLOAD_ROOT כבר כולל את uploads
  const resolved = path.resolve(UPLOAD_ROOT, rel);

  // אסור שהנתיב ייצא מתיקיית ההעלאות
  if (resolved !== UPLOAD_ROOT && !resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error(`נתיב תמונה לא חוקי (מחוץ לתיקיית ההעלאות): ${imagePath}`);
  }
  return resolved;
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.bmp': 'image/bmp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

// קורא תמונת עמוד מהדיסק ומחזיר { buffer, mimeType, displayName }.
// קריאה ישירה מהדיסק נמנעת מצורך ב-self-HTTP בעבודת רקע.
export async function readPageImage(imagePath) {
  const fsPath = resolveImageFsPath(imagePath);
  const buffer = await fs.readFile(fsPath);
  const ext = path.extname(fsPath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] || 'image/jpeg';
  return { buffer, mimeType, displayName: path.basename(fsPath) };
}

// חותך תמונה לשני חצאים אנכיים במרכז ומחזיר אותם בסדר קריאה עברי
// (חצי ימני קודם, אחריו חצי שמאלי). מנרמל את הפלט ל-JPEG.
export async function splitImageVertically(buffer) {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 2 || height < 1) {
    throw new Error('לא ניתן לחתוך תמונה בגודל לא תקין');
  }
  const halfW = Math.floor(width / 2);

  // extract לא משנה את ה-buffer המקורי, לכן יוצרים מופע sharp נפרד לכל חצי
  const right = await sharp(buffer)
    .extract({ left: halfW, top: 0, width: width - halfW, height })
    .jpeg()
    .toBuffer();
  const left = await sharp(buffer)
    .extract({ left: 0, top: 0, width: halfW, height })
    .jpeg()
    .toBuffer();

  return [
    { buffer: right, mimeType: 'image/jpeg', side: 'right' },
    { buffer: left, mimeType: 'image/jpeg', side: 'left' },
  ];
}
