#!/usr/bin/env node
// Reproducible PDF conversion benchmark; no production code changes.
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { convertPdfToImages } from '../src/lib/pdfConverter.js';

function integer(name, fallback, min, max) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  }
  return value;
}
const pages = integer('PDF_BENCH_PAGES', 12, 1, 200);
const rounds = integer('PDF_BENCH_ROUNDS', 3, 1, 20);
const width = integer('PDF_BENCH_WIDTH', 1200, 64, 6000);
const height = integer('PDF_BENCH_HEIGHT', 1600, 64, 6000);
const scale = Number(process.env.PDF_BENCH_SCALE ?? '2');
if (!Number.isFinite(scale) || scale <= 0 || scale > 8) throw new Error('PDF_BENCH_SCALE must be > 0 and <= 8');

async function fixture() {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawRectangle({ x: 20, y: 20, width: 555, height: 800, color: rgb((i % 5) / 5, .3, .7) });
    for (let j = 0; j < 70; j++) {
      page.drawText(`Page ${i + 1} row ${j}: deterministic sample 0123456789`, {
        x: 40, y: 800 - j * 10, size: 8,
      });
    }
  }
  return `data:application/pdf;base64,${Buffer.from(await doc.save()).toString('base64')}`;
}

const input = await fixture();
const results = [];
for (let round = 0; round < rounds; round++) {
  const dir = await mkdtemp(path.join(tmpdir(), 'otzaria-pdf-bench-'));
  const delay = monitorEventLoopDelay({ resolution: 10 });
  const before = process.memoryUsage().rss;
  let peakRss = before;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 10);
  const start = performance.now();
  delay.enable();
  try {
    const outputs = await convertPdfToImages(input, dir, { width, height, scale });
    const elapsedMs = performance.now() - start;
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    const images = [];
    for (const output of outputs) {
      const [bytes, meta] = await Promise.all([readFile(output.path), sharp(output.path).metadata()]);
      images.push({
        page: output.page, width: meta.width, height: meta.height,
        bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    results.push({
      round: round + 1, elapsedMs: Math.round(elapsedMs),
      eventLoopDelayP99Ms: Number((delay.percentile(99) / 1e6).toFixed(2)),
      rssBeforeMiB: Number((before / 1048576).toFixed(1)),
      peakRssMiB: Number((peakRss / 1048576).toFixed(1)),
      outputBytes: images.reduce((sum, x) => sum + x.bytes, 0),
      images,
    });
  } finally {
    delay.disable();
    clearInterval(sampler);
    await rm(dir, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({
  benchmark: 'pdf-conversion', node: process.version, platform: process.platform,
  fixture: { pages, width, height, scale }, results,
}, null, 2));
