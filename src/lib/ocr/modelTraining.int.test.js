// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { unzipSync, strFromU8 } from 'fflate';
import { startMongo } from '@/lib/corrections/testing/mongo';
import Book from '@/models/Book';
import Page from '@/models/Page';
import OcrJob from '@/models/OcrJob';
const state = vi.hoisted(() => ({ root: '' }));
vi.mock('./images', () => ({ resolveImageFsPath: () => path.join(state.root, 'page.png') }));
import { createTraining } from './modelTraining';
let db, book;
beforeAll(async () => {
  vi.stubEnv('REQUIRE_MONGODB_TESTS', '1'); db = await startMongo();
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), 'otz-train-'));
  vi.stubEnv('OCR_LOCAL_STORAGE_DIR', state.root);
  await sharp({ create: { width: 100, height: 200, channels: 3, background: '#ffffff' } }).png().toFile(path.join(state.root, 'page.png'));
});
afterAll(async () => { await db?.stop(); await fs.rm(state.root, { recursive: true, force: true }); vi.unstubAllEnvs(); });
beforeEach(async () => { await db.reset(); book = await Book.create({ name: 'test', slug: 'train' }); });
const actor = { user: { id: 'b'.repeat(24), role: 'admin_ocr', name: 'Trainer' } };
const req = () => ({ bookId: String(book._id), requestId: 'training-request-123', script: 'square', epochs: 3,
  pageNumbers: [1,2,3,4,5], approved: true });
async function pages() {
  return Page.create(Array.from({ length: 5 }, (_, i) => ({ book: book._id, pageNumber: i+1,
    imagePath: '/uploads/page.png', status: 'completed', content: '<p>טקסט <b>מוגה</b> על ידי הקהילה</p>' })));
}
it('freezes the actual five completed book pages and their corrected text, without separate line annotations', async () => {
  const source = await pages();
  await Page.updateOne({ _id: source[1]._id }, { $set: { isTwoColumns: true, rightColumn: 'גוף הספר', leftColumn: 'פירוש מוגה' } });
  const result = await createTraining(req(), actor, 'worker-1');
  expect(result.status).toBe(202);
  const job = await OcrJob.findById(result.body.job.id).lean();
  expect(job.taskType).toBe('training'); expect(job.status).toBe('queued'); expect(job.totalPages).toBe(5);
  expect(job.trainingOptions.bookId).toBe(String(book._id));
  const packagePath = path.join(state.root, job.inputPath);
  const frozenPackage = await fs.readFile(packagePath);
  const zip = unzipSync(frozenPackage);
  const dataset = JSON.parse(strFromU8(zip['dataset.json']));
  expect(dataset.kind).toBe('corrected-pages'); expect(dataset.pages).toHaveLength(5);
  expect(dataset.pages[0].text).toBe('טקסט מוגה על ידי הקהילה');
  expect(dataset.pages[1].text).toBe('גוף הספר פירוש מוגה');
  expect((await sharp(zip[dataset.pages[0].image]).metadata()).width).toBe(100);
  await Page.updateOne({ _id: source[0]._id }, { $set: { content: 'changed later' } });
  expect((await createTraining(req(), actor, 'worker-1')).body.job.id).toBe(String(job._id));
  expect(await OcrJob.countDocuments()).toBe(1);
  expect((await Page.findById(source[0]._id)).content).toBe('changed later');
  expect(await fs.readFile(packagePath)).toEqual(frozenPackage);
  expect((await OcrJob.findById(job._id)).inputSha256).toBe(job.inputSha256);
  expect((await createTraining({ ...req(), epochs: 4 }, actor, 'worker-1')).status).toBe(409);
});
it('refuses incomplete pages and never falls back to OCR output or old line-training pools', async () => {
  const source = await pages(); await Page.updateOne({ _id: source[4]._id }, { $set: { status: 'in-progress' } });
  await expect(createTraining(req(), actor, 'worker-1')).rejects.toThrow('five_completed_pages_required');
  expect((await OcrJob.findOne()).status).toBe('failed');
});
