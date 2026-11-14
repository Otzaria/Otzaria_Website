// צורת הדף — נתיבי הקבצים בשרת. הכול תחת storage/ (העלאות גולמיות, חיתוכים שמורים) או public/uploads/tzurat-hadaf
// (התמונות של העמודים — חסומות ב-/uploads ומוגשות רק דרך ה-API). כל path.join דינמי מסומן turbopackIgnore —
// אחרת ה-build עוקב אחרי התיקיות (scripts/check-production-trace.cjs).

import path from 'node:path';
import fs from 'node:fs/promises';
import { resolveImageFsPath } from '../ocr/images.js';
import { SLUG_RE, DAFKEY_RE, OBJECT_ID_RE } from './common.js';

export function storageRoot(env = process.env) {
  return path.resolve(
    /*turbopackIgnore: true*/ env.TZURAT_STORAGE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'storage', 'tzurat-hadaf')
  );
}

export const uploadsRoot = (env = process.env) => path.join(/*turbopackIgnore: true*/ storageRoot(env), 'uploads');

export function uploadDir(id, env = process.env) {
  if (!OBJECT_ID_RE.test(String(id))) throw new Error('מזהה העלאה לא תקין');
  return path.join(/*turbopackIgnore: true*/ uploadsRoot(env), String(id));
}

export const chunkPath = (id, n, env = process.env) => path.join(/*turbopackIgnore: true*/ uploadDir(id, env), `${Number(n)}.part`);
export const packagePath = (id, env = process.env) => path.join(/*turbopackIgnore: true*/ uploadDir(id, env), 'package.zip');
export const stagingDir = (id, env = process.env) => path.join(/*turbopackIgnore: true*/ uploadDir(id, env), 'staging');

// חיתוכים שמורים של המסלול המהיר (לא בגיבוי: נוצרים מחדש לפי הצורך)
export const cropsDir = (env = process.env) => path.join(/*turbopackIgnore: true*/ storageRoot(env), 'crops');

// הנתיב היחסי של תמונת עמוד (כפי שנשמר ב-TzuratPage.scan.path)
export function imageRelPath(slug, dafKey, side, ext) {
  if (!SLUG_RE.test(slug) || !DAFKEY_RE.test(dafKey) || !['scan', 'ours'].includes(side) || !/^(png|webp|jpg)$/.test(ext)) {
    throw new Error('נתיב תמונה לא תקין');
  }
  return `/uploads/tzurat-hadaf/${slug}/${dafKey}.${side}.${ext}`;
}

export const imageFsPath = (rel) => resolveImageFsPath(rel);

// כתיבה בטוחה: קובץ זמני באותה תיקייה ואז rename (קורא לעולם לא רואה קובץ חלקי)
export async function copyIntoPlace(src, dest) {
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.copyFile(/*turbopackIgnore: true*/ src, tmp);
    await fs.rename(/*turbopackIgnore: true*/ tmp, dest);
  } catch (e) {
    await fs.rm(/*turbopackIgnore: true*/ tmp, { force: true }).catch(() => {});
    throw e;
  }
}

export async function writeIntoPlace(dest, buffer) {
  await fs.mkdir(/*turbopackIgnore: true*/ path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(/*turbopackIgnore: true*/ tmp, buffer);
    await fs.rename(/*turbopackIgnore: true*/ tmp, dest);
  } catch (e) {
    await fs.rm(/*turbopackIgnore: true*/ tmp, { force: true }).catch(() => {});
    throw e;
  }
}

export async function exists(p) {
  try {
    await fs.access(/*turbopackIgnore: true*/ p);
    return true;
  } catch {
    return false;
  }
}
