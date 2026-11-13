import mongoose from 'mongoose';
import sharp from 'sharp';
import { Zip, ZipPassThrough } from 'fflate';
import { createHash } from 'node:crypto';
import Book from '@/models/Book';
import OcrJob from '@/models/OcrJob';
import Page from '@/models/Page';
import { load } from 'cheerio';


import { resolveImageFsPath } from './images';

import { normalizeLineText } from './textStandard';
import { writeJobFileDurable } from './localStorage';
import { TRAINING_LIMITS, trainingReleaseLink } from './modelTraining.pure';

const DURABLE = { writeConcern: { w: 1, j: true } };

export function trainingView(job) {
  let training;
  try { training = JSON.parse(job.resultMetadataJson || '{}').training; } catch { /* absent */ }
  return { id: String(job._id), status: job.status, active: job.active, script: job.trainingOptions?.script, epochs: job.trainingOptions?.epochs,
    bookId: String(job.book), requestId: job.requestId, selection: job.trainingSelection,
    pages: job.totalPages, phase: job.progressPhase, message: job.workerMessage,
    error: job.resultError?.code === 'quality_gate' ? 'המודל החדש לא עבר את בדיקת האיכות. המודל הקודם נשאר פעיל.' : job.error || job.resultError?.message, before: trainingReleaseLink(training?.before), after: trainingReleaseLink(training?.after),
    activated: training?.activated };
}

function plainText(value) {
  const $ = load(String(value || ''), null, false);
  $('script,style,img').remove();
  $('br').replaceWith(' ');
  $('p,div,h1,h2,h3,h4,li').each((_, el) => { $(el).append(' '); });
  return normalizeLineText($.root().text());
}

async function snapshot(req) {
  const pages = await Page.find({ book: req.bookId, pageNumber: { $in: req.pageNumbers } }).sort({ pageNumber: 1 }).lean();
  if (pages.length !== 5 || pages.some(p => p.status !== 'completed')) throw new Error('five_completed_pages_required');
  const chunks = []; let bytes = 0;
  const zip = new Zip((err, chunk) => {
    if (err) throw err;
    bytes += chunk.length;
    if (bytes > TRAINING_LIMITS.bytes) throw new Error('training_package_limit');
    chunks.push(Buffer.from(chunk));
  });
  const add = (name, data) => { const f = new ZipPassThrough(name); zip.add(f); f.push(data, true); };
  const frozen = [], pageMap = [];
  for (const page of pages) {
    const text = plainText(page.isTwoColumns ? [page.rightColumn, page.leftColumn].filter(Boolean).join('\n') : page.content);
    if (!text || text.length > 20000) throw new Error('invalid_corrected_page_text');
    const image = await sharp(resolveImageFsPath(page.imagePath)).rotate().png().toBuffer();
    const imageSha256 = createHash('sha256').update(image).digest('hex');
    const name = `images/${page._id}.png`;
    add(name, image);
    frozen.push({ image: name, text, book: req.bookId, pageId: String(page._id), pageNumber: page.pageNumber,
      imageSha256, expectedUpdatedAt: page.updatedAt, isTwoColumns: page.isTwoColumns });
    pageMap.push({ pdfPageIndex: pageMap.length + 1, page: page._id, pageNumber: page.pageNumber,
      expectedUpdatedAt: page.updatedAt, imageSha256 });
  }
  add('dataset.json', Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'corrected-pages',
    script: req.script, bookId: req.bookId, pages: frozen })));
  zip.end();
  return { data: Buffer.concat(chunks), pageMap };
}

export async function createTraining(req, session, workerId) {
  const fingerprint = createHash('sha256').update(JSON.stringify(req)).digest('hex');
  let job = await OcrJob.findOne({ requestId: req.requestId }).lean();
  if (job && (job.taskType !== 'training' || job.requestFingerprint !== fingerprint)) return { status: 409, body: { error: 'מזהה הבקשה כבר בשימוש' } };
  if (!job) {
    const book = await Book.findById(req.bookId).lean();
    if (!book) return { status: 404, body: { error: 'הספר לא נמצא' } };
    try {
      job = (await OcrJob.create([{ _id: new mongoose.Types.ObjectId(), book: book._id, bookName: book.name,
        bookSlug: book.slug, method: 'local', taskType: 'training', status: 'preparing', active: true,
        requestId: req.requestId, requestFingerprint: fingerprint, workerId,
        trainingOptions: { script: req.script, epochs: req.epochs, bookId: req.bookId },
        trainingSelection: { pageNumbers: req.pageNumbers, approved: true },
        startedBy: session.user.id, startedByName: session.user.name }], DURABLE))[0].toObject();
    } catch (e) {
      if (e.code !== 11000) throw e;
      const same = await OcrJob.findOne({ requestId: req.requestId }).lean();
      if (same?.taskType === 'training' && same.requestFingerprint === fingerprint) job = same;
      else return { status: 409, body: { error: 'כבר קיימת עבודה פעילה לספר' } };
    }
  }
  if (job.status !== 'preparing') return { status: 200, body: { job: trainingView(job) } };
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + 6 * 60 * 1000);
  const lease = await OcrJob.updateOne({ _id: job._id, status: 'preparing',
    $or: [{ prepLeaseUntil: null }, { prepLeaseUntil: { $lt: now } }] },
    { $set: { prepLeaseUntil: leaseUntil } }, DURABLE);
  if (!lease.matchedCount) return { status: 202, body: { job: trainingView(job), preparing: true } };
  try {
    const pack = await snapshot(req);
    const file = await writeJobFileDurable(String(job._id), 'training', pack.data);
    await OcrJob.updateOne({ _id: job._id, status: 'preparing', active: true, prepLeaseUntil: leaseUntil }, { $set: {
      inputPath: file.relPath, inputBytes: file.bytes, inputSha256: file.sha256, pageMap: pack.pageMap,
      totalPages: pack.pageMap.length, preparedAt: new Date(), prepLeaseUntil: null, status: 'queued' } }, DURABLE);
  } catch (e) {
    await OcrJob.updateOne({ _id: job._id, status: 'preparing', prepLeaseUntil: leaseUntil }, { $set: { status: 'failed', active: false,
      finishedAt: new Date(), prepLeaseUntil: null, error: 'הכנת חומר האימון נכשלה. נדרשים חמישה עמודים שהושלמו, עם הטקסט המתוקן שלהם.' } }, DURABLE);
    throw e;
  }
  return { status: 202, body: { job: trainingView(await OcrJob.findById(job._id).lean()) } };
}
