// קובץ-ההורדה של חמשת העמודים המוגהים למחשב המנהל — צד השרת. קורא את הארכיון הקפוא של עבודת
// האימון מהאחסון הפרטי (קריאה בלבד, אותה בדיקת נתיב/גודל כמו בהגשה לשירות + השוואת sha256),
// ומוסיף את ה-layout השמור של כל עמוד. לא כותב דבר: לא ל-OcrJob, לא לאחסון ולא לעמודים.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import OcrJob from '@/models/OcrJob';
import Page from '@/models/Page';
import OcrPageResult from '@/models/OcrPageResult';
import { openJobInput } from './localInputFile';
import { resolveImageFsPath } from './images';
import { composeDownload, frozenPageIds, layoutEntry, readFrozenPackage } from './modelTrainingDownload.pure';

const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const fail = (status, error) => ({ ok: false, status, error });

async function imageHashNow(imagePath) {
  try { return sha256(await fs.readFile(resolveImageFsPath(imagePath))); } catch { return null; }
}

async function currentLayouts(bookId, pageIds) {
  const pages = await Page.find({ _id: { $in: pageIds }, book: bookId })
    .select('_id imagePath lastOcrJobId lastOcrResultSha256').lean();
  const layouts = {};
  for (const page of pages) {
    const id = String(page._id);
    const record = page.lastOcrJobId && typeof page.lastOcrResultSha256 === 'string'
      ? await OcrPageResult.findOne({ page: page._id, job: page.lastOcrJobId, resultSha256: page.lastOcrResultSha256 })
        .select('job resultSha256 pipelineVersion receivedAt imageSha256 layoutStatus layoutVersion layoutJson').lean()
      : null;
    layouts[id] = layoutEntry({ pageId: id, record, imageSha256Now: record ? await imageHashNow(page.imagePath) : null });
  }
  return layouts;
}

/**
 * @param {string} jobId
 * @returns {Promise<{ok:true, data:Uint8Array, jobId:string} | {ok:false, status:number, error:string}>}
 */
export async function buildTrainingDownload(jobId) {
  const job = await OcrJob.findOne({ _id: jobId, taskType: 'training' })
    .select({ _id: 1, book: 1, taskType: 1, inputPath: 1, inputSha256: 1, inputBytes: 1, inputPurgedAt: 1, preparedAt: 1 }).lean();
  if (!job) return fail(404, 'עבודת האימון לא נמצאה');
  if (!job.inputPath) return fail(409, 'חומר האימון עדיין לא הוכן. המשיכו את הכנת החומר ונסו שוב.');
  const input = await openJobInput(job);
  if (!input.ok) {
    if (input.status === 503) return fail(503, 'האחסון של חומר האימון אינו זמין כרגע. נסו שוב מאוחר יותר.');
    if (input.code === 'input_corrupt') return fail(409, 'קובץ חומר האימון אינו תקין');
    return fail(410, 'קובץ חומר האימון כבר נמחק מהאתר (הוא נשמר 24 שעות אחרי סיום האימון)');
  }
  const frozen = new Uint8Array(await new Response(input.stream).arrayBuffer());
  if (sha256(frozen) !== job.inputSha256) return fail(409, 'קובץ חומר האימון אינו תקין');
  const { files, dataset } = readFrozenPackage(frozen);
  const layouts = await currentLayouts(job.book, frozenPageIds(dataset));
  const data = composeDownload({ files, dataset, layouts,
    job: { id: String(job._id), inputSha256: job.inputSha256, preparedAt: job.preparedAt } });
  return { ok: true, data, jobId: String(job._id) };
}
