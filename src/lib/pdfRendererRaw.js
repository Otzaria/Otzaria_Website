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
    return new Uint8Array(await arrayBuffer(input));
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
      const canvasWidth = Math.ceil(viewport.width);
      const canvasHeight = Math.ceil(viewport.height);
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
