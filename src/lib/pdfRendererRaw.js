// PDF.js -> canvas RGBA -> sharp JPEG. Avoid the PNG encode/decode round trip.
// Identical raster scale, background and sharp options to the legacy renderer.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import { readFile, rm } from 'node:fs/promises';
import { arrayBuffer } from 'node:stream/consumers';
import path from 'node:path';
import { pdfConversionGate } from './pdfConversionGate.js';

// Not require.resolve: webpack replaces it with a numeric module id in route bundles.
const pdfjsDir = path.join(process.cwd(), 'node_modules', 'pdfjs-dist');
const DATA_URL_PREFIX = 'data:application/pdf;base64:';
const DATA_URL = 'data:application/pdf;base64,';
const MAX_PAGE_PIXELS = 40_000_000;
const DEFAULT_TIMEOUT_MS = 300_000;

function abortReason(signal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('PDF conversion aborted');
  error.name = 'AbortError';
  return error;
}

async function* abortablePdfChunks(input, signal) {
  // A Web stream iterator queues return() behind pending next(); its reader can
  // cancel the pending read directly, including when the underlying source stalls.
  const reader = typeof input.getReader === 'function' ? input.getReader() : null;
  const iterator = reader ? { next: () => reader.read() } : input[Symbol.asyncIterator]();
  let finished = false;
  try {
    for (;;) {
      const step = await new Promise((resolve, reject) => {
        const finish = (settle, value) => {
          signal.removeEventListener('abort', onAbort);
          settle(value);
        };
        const onAbort = () => finish(reject, abortReason(signal));
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) return onAbort();
        try {
          // Keep both handlers attached: a pending next() can reject after abort.
          Promise.resolve(iterator.next()).then(
            value => finish(resolve, value), error => finish(reject, error),
          );
        } catch (error) { finish(reject, error); }
      });
      if (step.done) { finished = true; return; }
      yield step.value;
    }
  } finally {
    if (reader) {
      if (!finished) {
        try { void reader.cancel().catch(() => {}); } catch { /* Preserve the read/abort error. */ }
      }
      reader.releaseLock();
    } else if (!finished) {
      // Stop native streams and ask generic iterators to release resources.
      // Never await return(): an async generator can queue it behind a stuck next().
      try { input.destroy?.(); } catch { /* Preserve the read/abort error. */ }
      try { void Promise.resolve(iterator.return?.()).catch(() => {}); }
      catch { /* A synchronous cleanup failure must not retain the conversion slot. */ }
    }
  }
}

async function getPdfBytes(input, signal) {
  if (Buffer.isBuffer(input)) return Uint8Array.from(input);
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') {
    if (input.startsWith(DATA_URL)) {
      return Uint8Array.from(Buffer.from(input.slice(DATA_URL.length), 'base64'));
    }
    if (input.startsWith(DATA_URL_PREFIX)) {
      throw new TypeError('invalid PDF data URL');
    }
    return Uint8Array.from(await readFile(input, { signal }));
  }
  if (input && typeof input === 'object' && Symbol.asyncIterator in input) {
    return new Uint8Array(await arrayBuffer(abortablePdfChunks(input, signal)));
  }
  throw new TypeError('PDF source must be a file path, PDF data URL, bytes or async stream');
}

function timeoutSignal(userSignal, timeoutMs) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 3600000) {
    throw new RangeError('PDF timeout must be an integer from 1 to 3600000 ms');
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort(userSignal.reason);
  if (userSignal?.aborted) onAbort();
  else userSignal?.addEventListener('abort', onAbort, { once: true });

  const timer = setTimeout(() => {
    const error = new Error('PDF conversion timed out');
    error.name = 'TimeoutError';
    controller.abort(error);
  }, timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    close() {
      clearTimeout(timer);
      userSignal?.removeEventListener('abort', onAbort);
    },
  };
}

export async function convertPdfToImagesRaw(pdfSource, outputFolder, {
  width, height, scale, quality, filenamePrefix,
  signal: userSignal, timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  for (const [name, value] of [['width', width], ['height', height], ['scale', scale], ['quality', quality]]) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('invalid PDF conversion ' + name);
  }
  if (typeof filenamePrefix !== 'string' || !filenamePrefix) {
    throw new TypeError('invalid PDF filenamePrefix');
  }

  const deadline = timeoutSignal(userSignal, timeoutMs);
  const signal = deadline.signal;
  let release;
  let loadingTask;
  let renderTask;
  const written = [];
  let completed = false;

  const throwIfAborted = () => {
    if (signal.aborted) throw abortReason(signal);
  };
  const onAbort = () => {
    try { renderTask?.cancel(); } catch { /* render may already be complete */ }
    if (loadingTask) void loadingTask.destroy().catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    // Admission includes queueing time in the timeout; queue cannot grow unbounded.
    release = await pdfConversionGate.acquire(signal);
    throwIfAborted();
    const data = await getPdfBytes(pdfSource, signal);
    throwIfAborted();
    loadingTask = pdfjs.getDocument({
      data, isEvalSupported: false,
      standardFontDataUrl: path.join(pdfjsDir, 'standard_fonts') + path.sep,
      wasmUrl: path.join(pdfjsDir, 'wasm') + path.sep,
      cMapUrl: path.join(pdfjsDir, 'cmaps') + path.sep,
      cMapPacked: true,
    });
    const doc = await loadingTask.promise;
    const result = [];

    // Always sequential: one render and one JPEG write in memory per conversion.
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      throwIfAborted();
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      // pdf-to-img passes fractional dimensions to native canvas, which truncates.
      // Round the same way before the allocation guard to preserve JPEG pixels/size.
      let canvasWidth = Math.trunc(viewport.width);
      let canvasHeight = Math.trunc(viewport.height);
      if (canvasWidth === 0 || canvasHeight === 0) {
        // Native canvas substitutes its default size for a dimension below one
        // pixel. Read those defaults from a small canvas before checking the real
        // allocation, rather than rejecting a PDF the legacy renderer accepts.
        const defaults = createCanvas(0, 0);
        if (canvasWidth === 0) canvasWidth = defaults.width;
        if (canvasHeight === 0) canvasHeight = defaults.height;
        defaults.width = 0;
        defaults.height = 0;
      }
      if (!Number.isSafeInteger(canvasWidth) || !Number.isSafeInteger(canvasHeight) ||
          canvasWidth < 1 || canvasHeight < 1 ||
          canvasWidth * canvasHeight > MAX_PAGE_PIXELS) {
        const error = new RangeError('PDF page exceeds raster pixel limit');
        error.code = 'PDF_PAGE_TOO_LARGE';
        throw error;
      }
      const canvas = createCanvas(canvasWidth, canvasHeight);
      try {
        const context = canvas.getContext('2d');
        renderTask = page.render({
          canvasContext: context, viewport, background: 'rgb(255,255,255)',
        });
        await renderTask.promise;
        renderTask = null;
        throwIfAborted();

        const pixels = context.getImageData(0, 0, canvasWidth, canvasHeight);
        const outputPath = path.join(/*turbopackIgnore: true*/ outputFolder,
          filenamePrefix + '.' + pageNumber + '.jpg');
        written.push(outputPath);
        await sharp(Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.byteLength), {
          raw: { width: canvasWidth, height: canvasHeight, channels: 4 },
        }).resize(width, height, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality }).toFile(outputPath);
        throwIfAborted();
        result.push({ page: pageNumber, path: outputPath });
      } finally {
        renderTask = null;
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    throwIfAborted();
    completed = true;
    return result;
  } catch (error) {
    if (signal.aborted) throw abortReason(signal);
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    if (loadingTask) await loadingTask.destroy().catch(() => {});
    if (!completed) {
      await Promise.all(written.map((file) => rm(file, { force: true }).catch(() => {})));
    }
    release?.();
    deadline.close();
  }
}
