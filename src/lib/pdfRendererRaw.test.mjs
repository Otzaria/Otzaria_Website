import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { convertPdfToImages } from './pdfConverter.js';

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
    const doc = await PDFDocument.create();
    doc.addPage([5000, 5000]).drawText('Huge page');
    const data = Buffer.from(await doc.save());
    await assert.rejects(convertPdfToImages(data, dir), { code: 'PDF_PAGE_TOO_LARGE' });
  });
});
