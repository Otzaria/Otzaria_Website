// פתיחת קובץ הקלט (PDF) של עבודת OCR מקומית להגשה לעובד בזרימה — GET /api/worker/v1/jobs/{id}/input.
// imports יחסיים/מובנים בלבד (נבדק ב-node:test).
//
// - הקובץ נפתח פעם אחת (FileHandle), והגודל נבדק על אותו handle שממנו נקרא — אין מרוץ בין
//   בדיקה להגשה גם אם הקובץ נמחק בינתיים.
// - הזרימה היא pull: קוראים מהדיסק רק כשהצרכן מבקש (backpressure אמיתי) — PDF של עד 1GiB לא
//   נטען לזיכרון. לא Readable.toWeb על createReadStream ולא דפוס on('data').
// - תשובות השגיאה ממופות לפי איך שהשירות מסווג אותן (SiteClient/InputDownloader):
//   404/409 = דחייה קבועה → העבודה נעצרת אצלו ב-needs_attention (input_unavailable) למפעיל;
//   503 = זמני → ניסיון חוזר עם backoff (ו-Retry-After), בלי לעצור את העבודה.
import fs from 'node:fs/promises';
import { jobFileName, relToAbs, storageRoot } from './localStorage.js';

export const STREAM_CHUNK_BYTES = 256 * 1024;
const MISSING = new Set(['ENOENT', 'ENOTDIR']);
const STORAGE_RETRY_AFTER_SEC = 300;

/**
 * FileHandle → ReadableStream של בדיוק `size` בתים מתחילת הקובץ. קריאה רק ב-pull, handle נסגר
 * בסוף/בשגיאה/בביטול (הלקוח התנתק).
 * @param {import('node:fs/promises').FileHandle} fh
 * @param {number} size
 * @param {{chunkSize?:number}} [opts]
 */
export function fileHandleStream(fh, size, { chunkSize = STREAM_CHUNK_BYTES } = {}) {
  let pos = 0;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await fh.close().catch(() => {});
  };
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          const want = Math.min(chunkSize, size - pos);
          if (want <= 0) {
            await close();
            controller.close();
            return;
          }
          const buf = Buffer.allocUnsafe(want);
          const { bytesRead } = await fh.read(buf, 0, want, pos);
          if (bytesRead === 0) {
            // הקובץ התקצר באמצע (לא אמור לקרות — קבצי קלט לא משתנים): מפסיקים בשגיאה כדי
            // שהלקוח יראה העברה קטועה (Content-Length לא הושלם) ולא קובץ "שלם" שגוי.
            throw new Error('input_truncated');
          }
          pos += bytesRead;
          controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset, bytesRead));
        } catch (err) {
          await close();
          controller.error(err);
        }
      },
      async cancel() {
        await close();
      },
    },
    { highWaterMark: 1 }
  );
}

const fail = (status, code, extra = {}) => ({ ok: false, status, code, ...extra });

async function storageRootMissing(env) {
  try {
    const st = await fs.stat(/*turbopackIgnore: true*/ storageRoot(env));
    return !st.isDirectory();
  } catch (err) {
    if (MISSING.has(err?.code)) return true;
    throw err;
  }
}

/**
 * פותח את קובץ הקלט של עבודה (רשומת OcrJob lean עם _id, inputPath, inputSha256, inputBytes,
 * inputPurgedAt). מחזיר { ok:true, stream, size, sha256 } או { ok:false, status, code, retryAfter? }.
 * חריגת I/O אחרת (EACCES, EIO...) נזרקת — withWorker מחזיר 500 (זמני אצל השירות).
 */
export async function openJobInput(job, env = process.env) {
  if (!job?.inputPath || job.inputPurgedAt) return fail(404, 'input_unavailable');

  // הנתיב חייב להיות בדיוק <jobId>/input-<inputSha256>.pdf (כך buildJobInput כותב): שם הקובץ
  // קשור ל-hash, כך שרשומה שמפנה לקובץ של תוכן אחר נתפסת לפני ההגשה.
  let abs;
  try {
    const expected = `${String(job._id)}/${jobFileName('input', job.inputSha256)}`;
    if (job.inputPath !== expected) throw new Error('input_path_mismatch');
    abs = relToAbs(job.inputPath, env);
  } catch {
    return fail(409, 'input_corrupt');
  }

  let fh;
  try {
    fh = await fs.open(/*turbopackIgnore: true*/ abs, 'r');
  } catch (err) {
    if (!MISSING.has(err?.code) && err?.code !== 'EISDIR') throw err;
    // שורש האחסון עצמו חסר (כונן לא מחובר, OCR_LOCAL_STORAGE_DIR שגוי אחרי פריסה) — תקלה
    // זמנית של השרת, לא "הקובץ נמחק": 503 כדי שהשירות ינסה שוב ולא יעצור את כל העבודות.
    if (await storageRootMissing(env)) return fail(503, 'storage_unavailable', { retryAfter: STORAGE_RETRY_AFTER_SEC });
    return fail(404, 'input_unavailable');
  }

  try {
    const st = await fh.stat();
    if (!st.isFile()) {
      await fh.close();
      return fail(404, 'input_unavailable');
    }
    if (typeof job.inputBytes !== 'number' || st.size !== job.inputBytes) {
      await fh.close();
      return fail(409, 'input_corrupt');
    }
    return { ok: true, stream: fileHandleStream(fh, st.size), size: st.size, sha256: job.inputSha256 };
  } catch (err) {
    await fh.close().catch(() => {});
    throw err;
  }
}
