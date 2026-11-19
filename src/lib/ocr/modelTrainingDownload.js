// קובץ-ההורדה של חמשת העמודים המוגהים למחשב המנהל — צד השרת. קורא את הארכיון הקפוא של עבודת
// האימון מהאחסון הפרטי (קריאה בלבד, אותה בדיקת נתיב/גודל כמו בהגשה לשירות + השוואת sha256),
// ומוסיף את ה-layout השמור של כל עמוד. לא כותב דבר: לא ל-OcrJob, לא לאחסון ולא לעמודים.
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import OcrJob from '@/models/OcrJob';
import Page from '@/models/Page';
import OcrPageResult from '@/models/OcrPageResult';
import { openJobInputHandle } from './localInputFile';
import { resolveImageFsPath } from './images';
import { downloadEntries, frozenPageIds, layoutEntry } from './modelTrainingDownload.pure';
import { inspectTrainingPackage, trainingDownloadStream } from './modelTrainingDownload.stream';

const fail = (status, error) => ({ ok: false, status, error });

async function imageHashNow(imagePath) {
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(resolveImageFsPath(imagePath))) hash.update(chunk);
    return hash.digest('hex');
  } catch { return null; }
}

async function currentLayouts(bookId, pageIds) {
  const pages = await Page.find({ _id: { $in: pageIds }, book: bookId })
    .select('_id imagePath lastOcrJobId lastOcrResultSha256').lean();
  const layouts = {};
  const refs = pages.filter(page => page.lastOcrJobId && typeof page.lastOcrResultSha256 === 'string');
  const records = refs.length ? await OcrPageResult.find({ $or: refs.map(page => ({
    page: page._id, job: page.lastOcrJobId, resultSha256: page.lastOcrResultSha256,
  })) }).select('page job resultSha256 pipelineVersion receivedAt imageSha256 layoutStatus layoutVersion layoutJson').lean() : [];
  const byPage = new Map(records.map(record => [String(record.page), record]));
  for (const page of pages) {
    const id = String(page._id);
    const record = byPage.get(id);
    layouts[id] = layoutEntry({ pageId: id, record, imageSha256Now: record ? await imageHashNow(page.imagePath) : null });
  }
  return layouts;
}

/**
 * @param {string} jobId
 * @returns {Promise<{ok:true, stream:ReadableStream, jobId:string} | {ok:false, status:number, error:string}>}
 */
export async function buildTrainingDownload(jobId) {
  const job = await OcrJob.findOne({ _id: jobId, taskType: 'training' })
    .select({ _id: 1, book: 1, taskType: 1, inputPath: 1, inputSha256: 1, inputBytes: 1, inputPurgedAt: 1, preparedAt: 1 }).lean();
  if (!job) return fail(404, 'עבודת האימון לא נמצאה');
  if (!job.inputPath) return fail(409, 'חומר האימון עדיין לא הוכן. המשיכו את הכנת החומר ונסו שוב.');
  const input = await openJobInputHandle(job);
  if (!input.ok) {
    if (input.status === 503) return fail(503, 'האחסון של חומר האימון אינו זמין כרגע. נסו שוב מאוחר יותר.');
    if (input.code === 'input_corrupt') return fail(409, 'קובץ חומר האימון אינו תקין');
    return fail(410, 'קובץ חומר האימון כבר נמחק מהאתר (הוא נשמר 24 שעות אחרי סיום האימון)');
  }
  let archive;
  try {
    archive = await inspectTrainingPackage(input.handle, input.size, job.inputSha256);
    const { dataset } = archive;
    const layouts = await currentLayouts(job.book, frozenPageIds(dataset));
    const additions = downloadEntries({ dataset, layouts,
      job: { id: String(job._id), inputSha256: job.inputSha256, preparedAt: job.preparedAt } });
    const stream = trainingDownloadStream(archive, additions, () => input.handle.close());
    return { ok: true, stream, jobId: String(job._id) };
  } catch (error) {
    archive?.zip.close();
    await input.handle.close().catch(() => {});
    if (error.message === 'training_package_invalid') return fail(409, 'קובץ חומר האימון אינו תקין');
    throw error;
  }
}
