// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { unzipSync, strFromU8 } from 'fflate';
import { startMongo } from '@/lib/corrections/testing/mongo';
import Book from '@/models/Book';
import Page from '@/models/Page';
import OcrJob from '@/models/OcrJob';
import OcrPageResult from '@/models/OcrPageResult';
const state = vi.hoisted(() => ({ root: '' }));
vi.mock('./images', () => ({ resolveImageFsPath: () => path.join(state.root, 'page.png') }));
import { createTraining } from './modelTraining';
import { buildTrainingDownload } from './modelTrainingDownload';
let db, book;
beforeAll(async () => {
  vi.stubEnv('REQUIRE_MONGODB_TESTS', '1'); db = await startMongo();
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), 'otz-train-dl-'));
  vi.stubEnv('OCR_LOCAL_STORAGE_DIR', state.root);
  await sharp({ create: { width: 100, height: 200, channels: 3, background: '#ffffff' } }).png().toFile(path.join(state.root, 'page.png'));
}, 120000);
afterAll(async () => { await db?.stop(); await fs.rm(state.root, { recursive: true, force: true }); vi.unstubAllEnvs(); });
beforeEach(async () => { await db.reset(); book = await Book.create({ name: 'test', slug: 'train-dl' }); });
const actor = { user: { id: 'b'.repeat(24), role: 'admin_ocr', name: 'Trainer' } };
const req = () => ({ bookId: String(book._id), requestId: 'training-download-123', script: 'square', epochs: 3,
  pageNumbers: [1,2,3,4,5], approved: true });
const layout = { version: 1, image: { width: 100, height: 200 }, lines: [{ id: 'l1', box: [0, 0, 100, 20], script: 'square', text: 'OCR' }] };

async function trainedJob() {
  const pages = await Page.create(Array.from({ length: 5 }, (_, i) => ({ book: book._id, pageNumber: i+1,
    imagePath: '/uploads/page.png', status: 'completed', content: `<p>טקסט מוגה ${i+1}</p>` })));
  const ocrJob = new mongoose.Types.ObjectId(), resultSha256 = '9'.repeat(64);
  const imageSha256 = createHash('sha256').update(await fs.readFile(path.join(state.root, 'page.png'))).digest('hex');
  await OcrPageResult.create({ job: ocrJob, book: book._id, page: pages[0]._id, pageNumber: 1, resultSha256, imageSha256,
    layoutStatus: 'ok', layoutVersion: 1, layoutJson: JSON.stringify(layout) });
  await OcrPageResult.create({ job: ocrJob, book: book._id, page: pages[1]._id, pageNumber: 2, resultSha256, layoutStatus: 'too_large' });
  await Page.updateMany({ _id: { $in: [pages[0]._id, pages[1]._id] } }, { $set: { lastOcrJobId: ocrJob, lastOcrResultSha256: resultSha256 } });
  const created = await createTraining(req(), actor, 'worker-1');
  return { pages, job: await OcrJob.findById(created.body.job.id).lean() };
}

it('downloads the frozen archive unchanged plus the saved page layouts, without writing anything', async () => {
  const { pages, job } = await trainedJob();
  const packagePath = path.join(state.root, job.inputPath);
  const before = await fs.readFile(packagePath);
  const frozen = unzipSync(before);
  const result = await buildTrainingDownload(String(job._id));
  expect(result.ok).toBe(true);
  const out = unzipSync(new Uint8Array(await new Response(result.stream).arrayBuffer()));
  for (const [name, data] of Object.entries(frozen)) expect(out[name]).toEqual(data);
  const manifest = JSON.parse(strFromU8(out['download.json']));
  expect(manifest.inputSha256).toBe(job.inputSha256); expect(manifest.pages).toHaveLength(5);
  expect(manifest.pages.map(p => p.layoutStatus)).toEqual(['ok', 'too_large', 'none', 'none', 'none']);
  const saved = JSON.parse(strFromU8(out[`layouts/${pages[0]._id}.json`]));
  expect(saved.layout).toEqual(layout); expect(saved.sameImageAsOcr).toBe(true);
  expect(JSON.parse(strFromU8(out['dataset.json'])).pages[0].text).toBe('טקסט מוגה 1');
  expect(await fs.readFile(packagePath)).toEqual(before);
  expect(await OcrJob.findById(job._id).lean()).toEqual(job);
});

it('refuses OCR jobs, unprepared jobs and purged or tampered archives with a clear status', async () => {
  const { job } = await trainedJob();
  const ocr = await OcrJob.create({ book: book._id, bookName: 'x', bookSlug: 'x', method: 'local', status: 'queued' });
  expect((await buildTrainingDownload(String(ocr._id))).status).toBe(404);
  expect((await buildTrainingDownload(String(new mongoose.Types.ObjectId()))).status).toBe(404);
  await fs.writeFile(path.join(state.root, job.inputPath), Buffer.alloc(job.inputBytes, 1));
  expect((await buildTrainingDownload(String(job._id))).status).toBe(409);
  await OcrJob.updateOne({ _id: job._id }, { $set: { inputPurgedAt: new Date() } });
  expect((await buildTrainingDownload(String(job._id))).status).toBe(410);
  await OcrJob.updateOne({ _id: job._id }, { $unset: { inputPath: 1, inputPurgedAt: 1 } });
  expect((await buildTrainingDownload(String(job._id))).status).toBe(409);
});

it('closes the retained input handle when the download is cancelled', async () => {
  const { job } = await trainedJob();
  const open = vi.spyOn(fs, 'open');
  const result = await buildTrainingDownload(String(job._id));
  const handle = await open.mock.results.at(-1).value;
  const close = vi.spyOn(handle, 'close');
  await result.stream.cancel();
  expect(close).toHaveBeenCalledOnce();
  open.mockRestore();
});

it('closes the input if preparing the added metadata fails after verification', async () => {
  const { job } = await trainedJob();
  const open = vi.spyOn(fs, 'open');
  const find = vi.spyOn(Page, 'find').mockImplementationOnce(() => { throw new Error('database_unavailable'); });
  try {
    await expect(buildTrainingDownload(String(job._id))).rejects.toThrow('database_unavailable');
    const handle = await open.mock.results.at(-1).value;
    await expect(handle.stat()).rejects.toThrow('closed');
  } finally { find.mockRestore(); open.mockRestore(); }
});
