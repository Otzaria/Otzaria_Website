import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { downloadEntries, downloadFileName, frozenPageIds, layoutEntry } from './modelTrainingDownload.pure.js';

import { inspectTrainingPackage, trainingDownloadStream } from './modelTrainingDownload.stream.js';
const sha = data => createHash('sha256').update(data).digest('hex');
async function withPackage(data, action, expectedSha = sha(data)) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'training-download-'));
  const file = path.join(dir, 'input.zip');
  await fs.writeFile(file, data);
  const handle = await fs.open(file, 'r');
  let archive;
  try {
    archive = await inspectTrainingPackage(handle, data.length, expectedSha);
    return await action(archive, () => handle.close());
  } finally {
    archive?.zip.close();
    await handle.close().catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
}
const inspect = data => withPackage(data, archive => archive.dataset);
async function download(data, additions) {
  return withPackage(data, async (archive, close) => {
    const body = trainingDownloadStream(archive, additions(archive.dataset), close);
    return unzipSync(new Uint8Array(await new Response(body).arrayBuffer()));
  });
}

const book = 'a'.repeat(24), p1 = '1'.repeat(24), p2 = '2'.repeat(24), job = { id: 'c'.repeat(24), inputSha256: 'd'.repeat(64) };
const img1 = new Uint8Array([137, 80, 78, 71, 1, 2, 3]), img2 = new Uint8Array([137, 80, 78, 71, 9, 9]);
const dataset = { schemaVersion: 1, kind: 'corrected-pages', script: 'square', bookId: book, pages: [
  { image: `images/${p1}.png`, text: 'טקסט מוגה', book, pageId: p1, pageNumber: 3, imageSha256: 'e'.repeat(64) },
  { image: `images/${p2}.png`, text: 'עוד טקסט', book, pageId: p2, pageNumber: 7, imageSha256: 'f'.repeat(64) }] };
const datasetBytes = strToU8(JSON.stringify(dataset));
const frozen = zipSync({ [`images/${p1}.png`]: img1, [`images/${p2}.png`]: img2, 'dataset.json': datasetBytes });
const layout = { version: 1, image: { width: 100, height: 200 }, lines: [{ id: 'l1', box: [1, 2, 3, 4], script: 'square' }] };
const record = { job: 'b'.repeat(24), resultSha256: '9'.repeat(64), imageSha256: '8'.repeat(64), layoutStatus: 'ok', layoutVersion: 1, layoutJson: JSON.stringify(layout) };

test('the frozen entries are copied byte for byte and only layouts + download.json are added', async () => {
  const ds = await inspect(frozen);
  assert.deepEqual(frozenPageIds(ds), [p1, p2]);
  const layouts = { [p1]: layoutEntry({ pageId: p1, record, imageSha256Now: '8'.repeat(64) }), [p2]: layoutEntry({ pageId: p2, record: null }) };
  const out = await download(frozen, () => downloadEntries({ dataset: ds, job, layouts }));
  assert.deepEqual(Object.keys(out).sort(), ['dataset.json', 'download.json', `images/${p1}.png`, `images/${p2}.png`, `layouts/${p1}.json`].sort());
  assert.deepEqual(out[`images/${p1}.png`], img1);
  assert.deepEqual(out[`images/${p2}.png`], img2);
  assert.deepEqual(out['dataset.json'], datasetBytes);
  const manifest = JSON.parse(strFromU8(out['download.json']));
  assert.equal(manifest.kind, 'corrected-pages-download');
  assert.equal(manifest.jobId, job.id); assert.equal(manifest.inputSha256, job.inputSha256); assert.equal(manifest.bookId, book);
  assert.deepEqual(manifest.pages.map(p => [p.pageNumber, p.layout, p.layoutStatus]), [[3, `layouts/${p1}.json`, 'ok'], [7, null, 'none']]);
  assert.ok(!JSON.stringify(manifest).includes('טקסט'), 'the manifest does not duplicate the corrected text');
  const saved = JSON.parse(strFromU8(out[`layouts/${p1}.json`]));
  assert.deepEqual(saved.layout, layout);
  assert.equal(saved.sameImageAsOcr, true); assert.equal(saved.ocrJobId, record.job);
});

test('layout status is reported, never guessed', () => {
  assert.deepEqual(layoutEntry({ pageId: p1, record: null }), { status: 'none', entry: null });
  assert.deepEqual(layoutEntry({ pageId: p1, record: { layoutStatus: 'too_large' } }), { status: 'too_large', entry: null });
  assert.deepEqual(layoutEntry({ pageId: p1, record: { ...record, layoutJson: '{' } }), { status: 'invalid', entry: null });
  assert.equal(layoutEntry({ pageId: p1, record, imageSha256Now: '7'.repeat(64) }).entry.sameImageAsOcr, false);
  assert.equal(layoutEntry({ pageId: p1, record, imageSha256Now: null }).entry.sameImageAsOcr, null);
});

test('only a corrected-pages training archive is accepted, and names stay inside the archive layout', async () => {
  await assert.rejects(() => inspect(new Uint8Array([1, 2, 3])), /training_package_invalid/);
  await assert.rejects(() => inspect(zipSync({ 'x.txt': strToU8('x') })), /training_package_invalid/);
  await assert.rejects(() => inspect(zipSync({ 'dataset.json': strToU8(JSON.stringify({ kind: 'other', pages: [] })) })), /training_package_invalid/);
  await assert.rejects(() => inspect(zipSync({ 'dataset.json': datasetBytes, 'download.json': strToU8('{}') })), /training_package_invalid/);
  assert.deepEqual(frozenPageIds({ pages: [{ pageId: '../x' }, { pageId: p1 }] }), [p1]);
  assert.equal(downloadFileName(job.id), `training-pages-${job.id}.zip`);
  assert.throws(() => downloadFileName('../evil'), /invalid_job_id/);
});

test('stored and compressed inputs preserve every original entry byte', async () => {
  for (const level of [0, 6]) {
    const source = zipSync({ 'dataset.json': datasetBytes, 'images/page.png': img1 }, { level });
    const out = await download(source, ds => downloadEntries({ dataset: ds, job, layouts: {} }));
    assert.deepEqual(out['images/page.png'], img1);
    assert.deepEqual(out['dataset.json'], datasetBytes);
  }
});

test('download output respects backpressure and cancels the source when abandoned', async () => {
  let reads = 0, closed = 0;
  const input = Readable.from((async function* () {
    for (let n = 0; n < 512; n++) { reads++; yield Buffer.alloc(4096); }
  })(), { objectMode: false, highWaterMark: 4096 });
  const archive = { entries: [{ fileName: 'image.png' }], zip: { openReadStreamPromise: async () => input, close() {} } };
  const reader = trainingDownloadStream(archive, {}, async () => { closed++; }).getReader();
  await reader.read();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(reads < 4, `source reads: ${reads}`);
  await reader.cancel();
  assert.equal(input.destroyed, true);
  assert.equal(closed, 1);
});

test('cancellation during a pending read closes the source and owned handle once', async () => {
  let closed = 0;
  const input = new Readable({ read() {} });
  const archive = { entries: [{ fileName: 'image.png' }], zip: { openReadStreamPromise: async () => input, close() {} } };
  const reader = trainingDownloadStream(archive, {}, async () => { closed++; }).getReader();
  const pending = reader.read();
  await new Promise(resolve => setTimeout(resolve, 10));
  await reader.cancel();
  await pending;
  assert.equal(input.destroyed, true);
  assert.equal(closed, 1);
});

test('a download cancelled before its first read still closes the owned handle', async () => {
  let closed = 0, opened = 0;
  const archive = { entries: [{ fileName: 'image.png' }], zip: {
    openReadStreamPromise: async () => { opened++; }, close() {},
  } };
  await trainingDownloadStream(archive, {}, async () => { closed++; }).cancel();
  assert.equal(opened, 0);
  assert.equal(closed, 1);
});

test('an entry read failure errors the response and closes the owned handle', async () => {
  let closed = 0;
  const input = new Readable({ read() { this.destroy(new Error('read_failed')); } });
  const archive = { entries: [{ fileName: 'image.png' }], zip: { openReadStreamPromise: async () => input, close() {} } };
  const reader = trainingDownloadStream(archive, {}, async () => { closed++; }).getReader();
  await assert.rejects(reader.read(), /read_failed/);
  assert.equal(closed, 1);
});

test('verification rejects a wrong hash before a download can be created', async () => {
  await assert.rejects(withPackage(frozen, () => {}, '0'.repeat(64)), /training_package_invalid/);
});
