import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { composeDownload, downloadFileName, frozenPageIds, layoutEntry, readFrozenPackage } from './modelTrainingDownload.pure.js';

const book = 'a'.repeat(24), p1 = '1'.repeat(24), p2 = '2'.repeat(24), job = { id: 'c'.repeat(24), inputSha256: 'd'.repeat(64) };
const img1 = new Uint8Array([137, 80, 78, 71, 1, 2, 3]), img2 = new Uint8Array([137, 80, 78, 71, 9, 9]);
const dataset = { schemaVersion: 1, kind: 'corrected-pages', script: 'square', bookId: book, pages: [
  { image: `images/${p1}.png`, text: 'טקסט מוגה', book, pageId: p1, pageNumber: 3, imageSha256: 'e'.repeat(64) },
  { image: `images/${p2}.png`, text: 'עוד טקסט', book, pageId: p2, pageNumber: 7, imageSha256: 'f'.repeat(64) }] };
const datasetBytes = strToU8(JSON.stringify(dataset));
const frozen = zipSync({ [`images/${p1}.png`]: img1, [`images/${p2}.png`]: img2, 'dataset.json': datasetBytes });
const layout = { version: 1, image: { width: 100, height: 200 }, lines: [{ id: 'l1', box: [1, 2, 3, 4], script: 'square' }] };
const record = { job: 'b'.repeat(24), resultSha256: '9'.repeat(64), imageSha256: '8'.repeat(64), layoutStatus: 'ok', layoutVersion: 1, layoutJson: JSON.stringify(layout) };

test('the frozen entries are copied byte for byte and only layouts + download.json are added', () => {
  const { files, dataset: ds } = readFrozenPackage(frozen);
  assert.deepEqual(frozenPageIds(ds), [p1, p2]);
  const layouts = { [p1]: layoutEntry({ pageId: p1, record, imageSha256Now: '8'.repeat(64) }), [p2]: layoutEntry({ pageId: p2, record: null }) };
  const out = unzipSync(composeDownload({ files, dataset: ds, job, layouts }));
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

test('only a corrected-pages training archive is accepted, and names stay inside the archive layout', () => {
  assert.throws(() => readFrozenPackage(new Uint8Array([1, 2, 3])), /training_package_invalid/);
  assert.throws(() => readFrozenPackage(zipSync({ 'x.txt': strToU8('x') })), /training_package_invalid/);
  assert.throws(() => readFrozenPackage(zipSync({ 'dataset.json': strToU8(JSON.stringify({ kind: 'other', pages: [] })) })), /training_package_invalid/);
  assert.throws(() => readFrozenPackage(zipSync({ 'dataset.json': datasetBytes, 'download.json': strToU8('{}') })), /training_package_invalid/);
  assert.deepEqual(frozenPageIds({ pages: [{ pageId: '../x' }, { pageId: p1 }] }), [p1]);
  assert.equal(downloadFileName(job.id), `training-pages-${job.id}.zip`);
  assert.throws(() => downloadFileName('../evil'), /invalid_job_id/);
});
