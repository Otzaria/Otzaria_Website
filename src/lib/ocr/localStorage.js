// אחסון פרטי ועמיד לקבצי עבודות OCR מקומיות (PDF קלט, תוצאה, תוצאה שנדחתה).
// Storage is supplied by the live installation, not bundled build assets.
//
// - השורש: OCR_LOCAL_STORAGE_DIR, ברירת מחדל <cwd>/storage/ocr-local — **לא** תחת public/
//   (src/app/uploads מגיש כל קובץ שם לכולם). storage/ ב-.gitignore, מוחרג מ-tracing ב-next.config
//   ונשאר בין פריסות.
// - מבנה: <root>/<jobId>/<kind>-<sha256>.<ext>. ב-DB נשמר נתיב יחסי לשורש עם '/' (למשל
//   "64b7…/input-<sha>.pdf"), כך שהעברת השורש לא שוברת רשומות.
// - עמידות: כתיבה לקובץ זמני → fsync → rename → fsync לתיקייה (best-effort). קובץ סופי
//   לעולם לא נכתב חלקית, וה-DB מפנה אליו רק אחרי שהכתיבה הסתיימה.
// - קובץ בשם תוכן (sha256 בשם) לא מוחלף אחרי שנקבע: אם קיים כבר קובץ תקין באותו שם — נשמר.
//
// imports יחסיים/מובנים בלבד — נבדק ב-node:test.
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';

export const JOB_ID_RE = /^[a-f0-9]{24}$/;
export const SHA256_RE = /^[0-9a-f]{64}$/;
const FILE_KINDS = Object.freeze({ input: '.pdf', result: '.json', rejected: '.json' });
// סימון קובץ זמני: "<שם>.tmp-<hex>". sweepTmpFiles מוחק רק שמות שתואמים לזה.
const TMP_RE = /\.tmp-[0-9a-f]{8,}$/;
const FILE_MODE = 0o640;
const DIR_MODE = 0o750;

export function storageRoot(env = process.env) {
  const configured = typeof env.OCR_LOCAL_STORAGE_DIR === 'string' ? env.OCR_LOCAL_STORAGE_DIR.trim() : '';
  return path.resolve(
    /*turbopackIgnore: true*/ configured || path.join(/*turbopackIgnore: true*/ process.cwd(), 'storage', 'ocr-local')
  );
}

function isInside(root, abs) {
  return abs.startsWith(root + path.sep);
}

export function jobDir(jobId, env = process.env) {
  if (typeof jobId !== 'string' || !JOB_ID_RE.test(jobId)) throw new Error('invalid_job_id');
  const root = storageRoot(env);
  const abs = path.resolve(root, jobId);
  if (!isInside(root, abs)) throw new Error('invalid_job_id');
  return abs;
}

// שם קובץ לפי סוג ותוכן: input-<sha>.pdf / result-<sha>.json / rejected-<sha>.json
export function jobFileName(kind, sha256) {
  if (!Object.hasOwn(FILE_KINDS, kind)) throw new Error('invalid_file_kind');
  const ext = FILE_KINDS[kind];
  if (typeof sha256 !== 'string' || !SHA256_RE.test(sha256)) throw new Error('invalid_sha256');
  return `${kind}-${sha256}${ext}`;
}

// נתיב יחסי מה-DB → נתיב מוחלט, עם הגנת traversal: רק מקטעים "רגילים" מופרדים ב-'/',
// בלי '..', '.', מקטע ריק, '\\', ':' או NUL, והתוצאה חייבת להיות מתחת לשורש (לא השורש עצמו).
export function relToAbs(rel, env = process.env) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 512) throw new Error('invalid_storage_path');
  if (/[\\:\0]/.test(rel) || rel.startsWith('/')) throw new Error('invalid_storage_path');
  const segments = rel.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) throw new Error('invalid_storage_path');
  const root = storageRoot(env);
  const abs = path.resolve(root, ...segments);
  if (!isInside(root, abs)) throw new Error('invalid_storage_path');
  return abs;
}

// נתיב מוחלט מתחת לשורש → נתיב יחסי לשמירה ב-DB ('/' גם ב-Windows)
export function absToRel(abs, env = process.env) {
  const root = storageRoot(env);
  const resolved = path.resolve(/*turbopackIgnore: true*/ abs);
  if (!isInside(root, resolved)) throw new Error('invalid_storage_path');
  return path.relative(root, resolved).split(path.sep).join('/');
}

// fsync לתיקייה — כדי שה-rename עצמו ישרוד נפילת חשמל. ב-Windows אי אפשר לפתוח תיקייה
// לקריאה (EISDIR/EPERM) ו-NTFS מתעד את ה-rename ביומן, לכן מדלגים. כשל כאן לא מפיל.
async function fsyncDirBestEffort(dir) {
  if (process.platform === 'win32') return;
  let handle;
  try {
    handle = await fs.open(/*turbopackIgnore: true*/ dir, 'r');
    await handle.sync();
  } catch {
    // best-effort
  } finally {
    await handle?.close().catch(() => {});
  }
}

function toChunk(chunk) {
  if (typeof chunk === 'string') return Buffer.from(chunk, 'utf8');
  if (chunk instanceof Uint8Array) return chunk;
  throw new TypeError('unsupported_chunk');
}

// Buffer/Uint8Array/string — חתיכה אחת; אחרת (async) iterable של חתיכות (למשל stream)
async function* chunksOf(data) {
  if (typeof data === 'string' || data instanceof Uint8Array) {
    yield toChunk(data);
    return;
  }
  if (data == null || (typeof data[Symbol.asyncIterator] !== 'function' && typeof data[Symbol.iterator] !== 'function')) {
    throw new TypeError('unsupported_data');
  }
  for await (const chunk of data) yield toChunk(chunk);
}

const tmpSuffix = () => `.tmp-${randomBytes(8).toString('hex')}`;

// כותב את data לקובץ זמני באותה תיקייה, מחשב sha256 תוך כדי, fsync וסגירה.
// מחזיר { tmpPath, bytes, sha256 }. בכל כשל — הקובץ הזמני נמחק והחריגה נזרקת.
async function writeTmp(dir, baseName, data) {
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true, mode: DIR_MODE });
  const tmpPath = path.join(/*turbopackIgnore: true*/ dir, `${baseName}${tmpSuffix()}`);
  const hash = createHash('sha256');
  let bytes = 0;
  let handle;
  try {
    handle = await fs.open(/*turbopackIgnore: true*/ tmpPath, 'wx', FILE_MODE);
    for await (const chunk of chunksOf(data)) {
      let offset = 0;
      while (offset < chunk.byteLength) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
        offset += bytesWritten;
      }
      hash.update(chunk);
      bytes += chunk.byteLength;
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    return { tmpPath, bytes, sha256: hash.digest('hex') };
  } catch (err) {
    await handle?.close().catch(() => {});
    await removeQuiet(tmpPath);
    throw err;
  }
}

// כתיבה עמידה לנתיב ידוע: <name>.tmp-<rand> → fsync → rename → fsync לתיקייה.
// מחזירה { bytes, sha256 } (sha256 hex באותיות קטנות).
export async function writeFileDurable(absPath, data) {
  const dir = path.dirname(absPath);
  const { tmpPath, bytes, sha256 } = await writeTmp(dir, path.basename(absPath), data);
  try {
    await fs.rename(/*turbopackIgnore: true*/ tmpPath, absPath);
  } catch (err) {
    await removeQuiet(tmpPath);
    throw err;
  }
  await fsyncDirBestEffort(dir);
  return { bytes, sha256 };
}

// כתיבה עמידה לקובץ בשם-תוכן <kind>-<sha>.<ext> בתיקיית העבודה. ה-sha ידוע רק בסוף
// הכתיבה (גם לזרם), ולכן כותבים לזמני ואז rename לשם הסופי.
// אם כבר קיים קובץ סופי באותו שם עם אותו גודל ו-hash — הוא נשמר כמו שהוא (הקובץ לא
// מתחלף אחרי שנקבע) והזמני נמחק. קובץ קיים פגום (גודל/hash אחר) — מוחלף בתוכן הנכון.
// מחזירה { relPath, absPath, bytes, sha256, reused }.
// expectedSha256 (רשות): אם ה-hash בפועל שונה — הזמני (הייחודי לבקשה הזו) נמחק, הקובץ הסופי
// לא נוצר ולא נוגעים בו, ומוחזר { mismatch:true, bytes, sha256 } בלי נתיבים. כך בקשה עם כותרת
// hash שגויה לא יכולה למחוק קובץ באותו שם שבקשה מקבילה תקינה כבר נעלה (מרוץ hash_mismatch).
export async function writeJobFileDurable(jobId, kind, data, env = process.env, { expectedSha256 } = {}) {
  const dir = jobDir(jobId, env);
  if (!Object.hasOwn(FILE_KINDS, kind)) throw new Error('invalid_file_kind');
  const { tmpPath, bytes, sha256 } = await writeTmp(dir, kind, data);
  if (expectedSha256 != null && sha256 !== expectedSha256) {
    await removeQuiet(tmpPath);
    return { mismatch: true, relPath: null, absPath: null, bytes, sha256, reused: false };
  }
  const absPath = path.join(/*turbopackIgnore: true*/ dir, jobFileName(kind, sha256));
  let reused = false;
  try {
    const st = await fs.stat(/*turbopackIgnore: true*/ absPath).catch(() => null);
    if (st?.isFile() && st.size === bytes && (await sha256File(absPath)) === sha256) {
      reused = true;
      await removeQuiet(tmpPath);
    } else {
      await fs.rename(/*turbopackIgnore: true*/ tmpPath, absPath);
      await fsyncDirBestEffort(dir);
    }
  } catch (err) {
    await removeQuiet(tmpPath);
    throw err;
  }
  return { relPath: absToRel(absPath, env), absPath, bytes, sha256, reused };
}

// sha256 של קובץ בזרימה (בלי לטעון לזיכרון) — hex באותיות קטנות
export async function sha256File(absPath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(/*turbopackIgnore: true*/ absPath)) hash.update(chunk);
  return hash.digest('hex');
}

export async function removeQuiet(absPath) {
  try {
    await fs.rm(/*turbopackIgnore: true*/ absPath, { force: true });
  } catch {
    // שקט בכוונה
  }
}

// מוחק קבצים זמניים יתומים (תהליך שנפל באמצע כתיבה) שגילם מעל olderThanMs — בשורש
// ובתיקיות העבודות (רמה אחת). לא נוגע בשום קובץ אחר, ולא עוקב אחרי קישורים סימבוליים.
// מחזירה את מספר הקבצים שנמחקו.
export async function sweepTmpFiles(olderThanMs, { now = Date.now(), env = process.env } = {}) {
  const root = storageRoot(env);
  const cutoff = now - olderThanMs;
  let removed = 0;
  const sweepDir = async (dir, depth) => {
    let entries;
    try {
      entries = await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(/*turbopackIgnore: true*/ dir, entry.name);
      if (entry.isDirectory()) {
        if (depth === 0 && JOB_ID_RE.test(entry.name)) await sweepDir(abs, 1);
        continue;
      }
      if (!entry.isFile() || !TMP_RE.test(entry.name)) continue;
      const st = await fs.lstat(/*turbopackIgnore: true*/ abs).catch(() => null);
      if (st?.isFile() && st.mtimeMs < cutoff) {
        await removeQuiet(abs);
        removed++;
      }
    }
  };
  await sweepDir(root, 0);
  return removed;
}
