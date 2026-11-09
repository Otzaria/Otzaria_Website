#!/usr/bin/env node
// Comparative A/B harness; baseline is the unmodified production converter.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { convertPdfToImages } from '../src/lib/pdfConverter.js';

const require = createRequire(import.meta.url);
const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const defaults = { width: 1200, height: 1600, scale: 2, quality: 85 };
const cases = [
  { name: 'a4-six', pages: 6, pageWidth: 595, pageHeight: 842 },
  { name: 'a4-long', pages: 30, pageWidth: 595, pageHeight: 842 },
  { name: 'large-page', pages: 1, pageWidth: 1600, pageHeight: 2400 },
];
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function createFixture(file, spec) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < spec.pages; i++) {
    const page = doc.addPage([spec.pageWidth, spec.pageHeight]);
    page.drawRectangle({
      x: 20, y: 20, width: spec.pageWidth - 40, height: spec.pageHeight - 40,
      color: rgb((i % 5) / 5, .3, .7),
    });
    for (let j = 0; j < 70; j++) {
      page.drawText('Page ' + (i + 1) + ' row ' + j + ': deterministic sample 0123456789', {
        x: 40, y: spec.pageHeight - 42 - j * 10, size: 8,
      });
    }
    page.drawLine({
      start: { x: 40, y: 30 }, end: { x: spec.pageWidth - 40, y: 50 },
      color: rgb(0, 0, 0), thickness: .65,
    });
  }
  const bytes = Buffer.from(await doc.save());
  await writeFile(file, bytes);
  return { sha256: sha(bytes), bytes: bytes.length };
}

async function convertRaw(input, outputDir, options, mode) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const bytes = await readFile(input);
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    isEvalSupported: false,
    standardFontDataUrl: path.join(pdfjsDir, 'standard_fonts') + path.sep,
    wasmUrl: path.join(pdfjsDir, 'wasm') + path.sep,
    cMapUrl: path.join(pdfjsDir, 'cmaps') + path.sep,
    cMapPacked: true,
  });
  const results = [];
  try {
    const document = await loadingTask.promise;
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const original = page.getViewport({ scale: options.scale });
      const factor = mode === 'fit'
        ? Math.min(1, options.width / original.width, options.height / original.height)
        : 1;
      const viewport = factor === 1 ? original : page.getViewport({ scale: options.scale * factor });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      try {
        await page.render({ canvasContext: ctx, viewport, background: 'rgb(255,255,255)' }).promise;
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const jpegPath = path.join(outputDir, 'page.' + n + '.jpg');
        await sharp(Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength), {
          raw: { width: canvas.width, height: canvas.height, channels: 4 },
        }).resize(options.width, options.height, {
          fit: 'inside', withoutEnlargement: true,
        }).jpeg({ quality: options.quality }).toFile(jpegPath);
        results.push({ page: n, path: jpegPath });
      } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    return results;
  } finally {
    await loadingTask.destroy();
  }
}

async function runChild(variant, input, outputBase) {
  const elapsed = [];
  const peakRss = [];
  const eventP99 = [];
  const rounds = [];
  for (let round = 1; round <= 2; round++) {
    const output = path.join(outputBase, 'round-' + round);
    await mkdir(output, { recursive: true });
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    let peak = process.memoryUsage().rss;
    const timer = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 10);
    const started = performance.now();
    histogram.enable();
    try {
      const images = variant === 'baseline'
        ? await convertPdfToImages(input, output, defaults)
        : await convertRaw(input, output, defaults, variant);
      elapsed.push(Math.round(performance.now() - started));
      peakRss.push(Number((Math.max(peak, process.memoryUsage().rss) / 1048576).toFixed(1)));
      eventP99.push(Number((histogram.percentile(99) / 1e6).toFixed(2)));
      rounds.push({
        imageCount: images.length,
        outputBytes: (await Promise.all(images.map((x) => stat(x.path)))).reduce((x, y) => x + y.size, 0),
      });
    } finally {
      clearInterval(timer);
      histogram.disable();
    }
  }
  return { variant, elapsedMs: elapsed, peakRssMiB: peakRss, eventLoopP99Ms: eventP99, rounds };
}

function childProcess(variant, input, dir) {
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', variant, input, dir], {
    encoding: 'utf8', timeout: 240000, maxBuffer: 1024 * 1024 * 2,
  });
  if (run.error || run.status !== 0) {
    throw new Error('runner ' + variant + ' failed: ' + (run.error?.message || run.stderr || run.stdout));
  }
  const marker = run.stdout.split('\n').find((x) => x.startsWith('PDF_AB_JSON='));
  if (!marker) throw new Error('missing runner result for ' + variant + ': ' + run.stdout);
  return JSON.parse(marker.slice('PDF_AB_JSON='.length));
}

async function compareJpegs(first, second) {
  const [base, candidate] = await Promise.all([
    sharp(first).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(second).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const a = base.info;
  const b = candidate.info;
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    throw new Error('image dimensions/channels differ between baseline and candidate');
  }
  let error = 0;
  let mse = 0;
  for (let i = 0; i < base.data.length; i++) {
    const delta = base.data[i] - candidate.data[i];
    error += Math.abs(delta);
    mse += delta * delta;
  }
  const count = base.data.length;
  return {
    width: a.width, height: a.height,
    meanAbsError: Number((error / count).toFixed(3)),
    psnrDb: mse === 0 ? null : Number((10 * Math.log10(255 * 255 / (mse / count))).toFixed(2)),
    pixelExact: mse === 0,
  };
}

async function main() {
  const root = await mkdtemp(path.join(tmpdir(), 'otzaria-pdf-ab-'));
  try {
    const reports = [];
    for (const fixture of cases) {
      const file = path.join(root, fixture.name + '.pdf');
      const identity = await createFixture(file, fixture);
      const runs = {};
      for (const variant of ['baseline', 'raw', 'fit']) {
        const dir = path.join(root, fixture.name + '-' + variant);
        await mkdir(dir);
        runs[variant] = childProcess(variant, file, dir);
        runs[variant].outputFolder = dir;
      }
      const quality = {};
      for (const variant of ['raw', 'fit']) {
        let maxMae = 0;
        let minPsnr = Infinity;
        let exactCount = 0;
        const samples = [];
        for (let p = 1; p <= fixture.pages; p++) {
          const basePath = path.join(runs.baseline.outputFolder, 'round-2', 'page.' + p + '.jpg');
          const actualPath = path.join(runs[variant].outputFolder, 'round-2', 'page.' + p + '.jpg');
          const q = await compareJpegs(basePath, actualPath);
          maxMae = Math.max(maxMae, q.meanAbsError);
          minPsnr = Math.min(minPsnr, q.psnrDb ?? Infinity);
          if (q.pixelExact) exactCount++;
          if (p === 1 || p === fixture.pages) samples.push({ page: p, ...q });
        }
        quality[variant] = {
          pagesChecked: fixture.pages, maxMeanAbsError: maxMae,
          minPsnrDb: minPsnr === Infinity ? null : minPsnr,
          pixelExactCount: exactCount, samplePages: samples,
        };
      }
      for (const x of Object.values(runs)) delete x.outputFolder;
      reports.push({ fixture, source: identity, runs, quality });
    }
    console.log(JSON.stringify({
      experiment: 'pdf-to-img-png-vs-raw-and-fit',
      baselineSource: 'src/lib/pdfConverter.js@dfa6d620',
      node: process.version,
      platform: process.platform,
      pdfjsVersion: require('pdfjs-dist/package.json').version,
      canvasVersion: require('@napi-rs/canvas/package.json').version,
      sharpLibvipsVersion: sharp.versions.vips,
      options: defaults,
      scenarios: reports,
    }, null, 2));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--child') {
  const result = await runChild(process.argv[3], process.argv[4], process.argv[5]);
  console.log('PDF_AB_JSON=' + JSON.stringify(result));
} else {
  await main();
}
