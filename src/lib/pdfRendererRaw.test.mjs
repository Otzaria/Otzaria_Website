import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PassThrough, Readable } from 'node:stream';
import sharp from 'sharp';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { convertPdfToImages } from './pdfConverter.js';
import { pdfConversionGate } from './pdfConversionGate.js';

async function fixture() {
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(await sharp({
    create: { width: 80, height: 80, channels: 4, background: '#3299cc' },
  }).png().toBuffer());
  const shapes = [
    { size: [595, 842], rotation: 0 },
    { size: [842, 595], rotation: 0 },
    { size: [595, 842], rotation: 90 },
  ];
  for (const [i, shape] of shapes.entries()) {
    const page = doc.addPage(shape.size);
    page.setRotation(degrees(shape.rotation));
    page.drawRectangle({ x: 20, y: 20, width: 250, height: 300, color: rgb(.2, (i + 1) / 4, .6) });
    page.drawImage(image, { x: 30, y: 40, width: 100, height: 120 });
    page.drawText('A4 raster quality and rotation 0123456789', { x: 32, y: 490, size: 11 });
  }
  return 'data:application/pdf;base64,' + Buffer.from(await doc.save()).toString('base64');
}

async function work(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'otzaria-pdf-raw-qa-'));
  try { return await fn(dir); }
  finally { await rm(dir, { force: true, recursive: true }); }
}

async function within(promise, ms = 2000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('operation did not settle')), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

test('new renderer is byte-identical to the previous converter for text, raster, landscape and rotated pages', { timeout: 60000 }, async () => {
  await work(async (dir) => {
    const legacyDir = path.join(dir, 'legacy');
    const rawDir = path.join(dir, 'raw');
    await Promise.all([mkdir(legacyDir), mkdir(rawDir)]);
    const data = await fixture();
    const config = { width: 1200, height: 1600, scale: 2, quality: 85, filenamePrefix: 'scan' };
    const baseline = await convertPdfToImages(data, legacyDir, { ...config, renderer: 'legacy' });
    const candidate = await convertPdfToImages(data, rawDir, { ...config, renderer: 'raw' });
    assert.equal(candidate.length, 3);
    for (const [index, page] of candidate.entries()) {
      assert.equal(page.page, index + 1);
      assert.equal(path.basename(page.path), 'scan.' + (index + 1) + '.jpg');
      const [actual, previous] = await Promise.all([
        readFile(page.path), readFile(baseline[index].path),
      ]);
      assert.ok(actual.equals(previous), 'JPEG byte parity failed at page ' + page.page);
      const image = await sharp(page.path).metadata();
      assert.equal(image.format, 'jpeg');
      assert.ok(image.width <= 1200 && image.height <= 1600);
    }
  });
});

test('fractional PDF dimensions and scales preserve legacy image dimensions and JPEG bytes', { timeout: 60000 }, async () => {
  await work(async dir => {
    const doc = await PDFDocument.create();
    for (const { size, rotation } of [
      { size: [595.28, 841.89], rotation: 0 },
      { size: [595.28, 841.89], rotation: 90 },
      { size: [300.25, 400.25], rotation: 0 },
      { size: [0.25, 100], rotation: 0 },
      { size: [100, 0.25], rotation: 0 },
    ]) {
      const page = doc.addPage(size);
      page.setRotation(degrees(rotation));
      page.drawRectangle({ x: 0, y: 0, width: size[0], height: size[1], color: rgb(.2, .4, .6) });
      page.drawText('Fractional page and raster dimensions', { x: 20, y: 100, size: 12 });
    }
    const data = Buffer.from(await doc.save());
    for (const scale of [2, 1.37]) {
      const legacyDir = path.join(dir, 'legacy-' + scale);
      const rawDir = path.join(dir, 'raw-' + scale);
      await Promise.all([mkdir(legacyDir), mkdir(rawDir)]);
      const baseline = await convertPdfToImages(data, legacyDir, { scale, renderer: 'legacy' });
      const candidate = await convertPdfToImages(data, rawDir, { scale });
      for (const [index, page] of candidate.entries()) {
        const previous = await readFile(baseline[index].path);
        const actual = await readFile(page.path);
        const before = await sharp(previous).metadata();
        const after = await sharp(actual).metadata();
        assert.deepEqual([after.width, after.height], [before.width, before.height]);
        assert.ok(actual.equals(previous), `JPEG differs at scale ${scale}, page ${index + 1}`);
      }
      if (scale === 2) {
        const a4 = await sharp(candidate[0].path).metadata();
        const small = await sharp(candidate[2].path).metadata();
        assert.deepEqual([a4.width, a4.height], [1131, 1600]);
        assert.deepEqual([small.width, small.height], [600, 800]);
      }
    }
  });
});

test('timeout destroys a stalled Node stream, releases the gate and admits the next PDF', { timeout: 20000 }, async () => {
  await work(async dir => {
    const stream = new PassThrough();
    stream.write('%PDF-1.7\n');
    try {
      await within(assert.rejects(convertPdfToImages(stream, dir, { timeoutMs: 25 }), { name: 'TimeoutError' }));
      assert.equal(stream.destroyed, true);
      assert.equal(pdfConversionGate.active, 0);
      assert.equal(pdfConversionGate.queued, 0);
      assert.deepEqual(await readdir(dir), []);
      assert.equal((await convertPdfToImages(await fixture(), dir)).length, 3);
    } finally { stream.destroy(); }
  });
});

test('external abort cancels a stalled Web stream and keeps the original abort reason', { timeout: 20000 }, async () => {
  await work(async dir => {
    let started, cancelled = false;
    const reading = new Promise(resolve => { started = resolve; });
    const stream = new ReadableStream({
      pull() { started(); },
      cancel() { cancelled = true; },
    }, { highWaterMark: 0 });
    const controller = new AbortController();
    const reason = new Error('caller stopped reading');
    const pending = convertPdfToImages(stream, dir, { signal: controller.signal });
    const rejection = assert.rejects(pending, error => error === reason);
    await within(reading);
    controller.abort(reason);
    await within(rejection);
    assert.equal(cancelled, true);
    assert.equal(stream.locked, false);
    assert.equal(pdfConversionGate.active, 0);
    assert.deepEqual(await readdir(dir), []);
  });
});

test('abort does not wait for a stalled iterator return or resume reading after a late rejection', { timeout: 20000 }, async () => {
  await work(async dir => {
    let rejectRead, started, reads = 0, returns = 0;
    const reading = new Promise(resolve => { started = resolve; });
    const stream = {
      [Symbol.asyncIterator]() { return this; },
      next() { reads++; started(); return new Promise((_, reject) => { rejectRead = reject; }); },
      return() { returns++; return new Promise(() => {}); },
    };
    const controller = new AbortController();
    const pending = convertPdfToImages(stream, dir, { signal: controller.signal });
    const rejection = assert.rejects(pending, { name: 'AbortError' });
    await within(reading);
    controller.abort();
    await within(rejection);
    assert.equal(returns, 1);
    assert.equal(pdfConversionGate.active, 0);
    // The abandoned next() still has a rejection handler and cannot start another read.
    rejectRead(new Error('late source failure'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1);
    assert.equal((await convertPdfToImages(await fixture(), dir)).length, 3);
  });
});

test('normally completing Node and Web streams keep the same JPEG bytes', { timeout: 60000 }, async () => {
  await work(async dir => {
    const data = await fixture();
    const bytes = Buffer.from(data.split(',')[1], 'base64');
    const chunks = [bytes.subarray(0, 100), bytes.subarray(100)];
    const baselineDir = path.join(dir, 'baseline');
    await mkdir(baselineDir);
    const baseline = await convertPdfToImages(data, baselineDir, { renderer: 'legacy' });
    for (const [i, stream] of [
      Readable.from(chunks),
      new ReadableStream({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); } }),
    ].entries()) {
      const out = path.join(dir, 'stream-' + i);
      await mkdir(out);
      const pages = await convertPdfToImages(stream, out);
      assert.equal(pages.length, baseline.length);
      for (const [index, page] of pages.entries()) {
        assert.ok((await readFile(page.path)).equals(await readFile(baseline[index].path)));
      }
    }
    assert.equal(pdfConversionGate.active, 0);
  });
});

test('failed output write cleans completed JPEGs, releases PDF and admits next conversion', { timeout: 60000 }, async () => {
  await work(async (dir) => {
    const data = await fixture();
    await mkdir(path.join(dir, 'page.2.jpg'));
    await assert.rejects(convertPdfToImages(data, dir));
    await assert.rejects(stat(path.join(dir, 'page.1.jpg')), { code: 'ENOENT' });
    const successDir = path.join(dir, 'success');
    await mkdir(successDir);
    assert.equal((await convertPdfToImages(data, successDir)).length, 3);
  });
});

test('already-aborted conversion does not leave an output file or occupy queue capacity', { timeout: 20000 }, async () => {
  await work(async (dir) => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(convertPdfToImages(await fixture(), dir, { signal: controller.signal }), { name: 'AbortError' });
    assert.deepEqual(await readdir(dir), []);
  });
});

test('timeout cancels conversion and allows a later conversion', { timeout: 30000 }, async () => {
  await work(async (dir) => {
    const data = await fixture();
    await assert.rejects(convertPdfToImages(data, dir, { timeoutMs: 1 }), { name: 'TimeoutError' });
    const followup = path.join(dir, 'followup');
    await mkdir(followup);
    assert.equal((await convertPdfToImages(data, followup, { timeoutMs: 15000 })).length, 3);
  });
});


test('aborting an in-flight render releases resources, removes partial files and recovers', { timeout: 30000 }, async () => {
  await work(async (dir) => {
    const source = await fixture();
    const abort = new AbortController();
    const pending = convertPdfToImages(source, dir, { signal: abort.signal });
    const timer = setTimeout(() => abort.abort(), 10);
    try {
      await assert.rejects(pending, { name: 'AbortError' });
      assert.deepEqual(await readdir(dir), []);
      const recovered = path.join(dir, 'recovered');
      await mkdir(recovered);
      assert.equal((await convertPdfToImages(source, recovered)).length, 3);
    } finally {
      clearTimeout(timer);
    }
  });
});

test('excessively large raster pages are rejected before native canvas allocation', { timeout: 20000 }, async () => {
  await work(async (dir) => {
    for (const size of [[5000, 5000], [0.25, 100000]]) {
      const doc = await PDFDocument.create();
      doc.addPage(size).drawText('Huge page');
      const data = Buffer.from(await doc.save());
      await assert.rejects(convertPdfToImages(data, dir), { code: 'PDF_PAGE_TOO_LARGE' });
    }
  });
});
