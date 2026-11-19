import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import { Zip, ZipPassThrough } from 'fflate';
import { fileHandleStream } from './localInputFile.js';
import { isDownloadEntry, parseFrozenDataset } from './modelTrainingDownload.pure.js';

const EMPTY = new Uint8Array();
const DATASET_MAX_BYTES = 2 * 1024 * 1024;
const invalid = () => new Error('training_package_invalid');

// ZIP readers borrow the same verified handle; only the download owns its lifetime.
class InputReader extends yauzl.RandomAccessReader {
  constructor(handle) { super(); this.handle = handle; }
  _readStreamForRange(start, end) {
    const handle = this.handle;
    return Readable.from((async function* () {
      for (let position = start; position < end;) {
        const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, end - position));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        position += bytesRead;
        yield buffer.subarray(0, bytesRead);
      }
    })(), { objectMode: false, highWaterMark: 64 * 1024 });
  }
}

/** Verify the file, then read only directory metadata and the small dataset. */
export async function inspectTrainingPackage(handle, size, expectedSha256) {
  const hash = createHash('sha256');
  for await (const chunk of fileHandleStream(handle, size, { closeOnEnd: false })) hash.update(chunk);
  if (hash.digest('hex') !== expectedSha256) throw invalid();
  let zip;
  try {
    zip = await yauzl.fromRandomAccessReaderPromise(new InputReader(handle), size, { autoClose: false });
    const entries = [], names = new Set();
    let dataset;
    for await (const entry of zip.eachEntry()) {
      if (isDownloadEntry(entry.fileName) || names.has(entry.fileName)) throw invalid();
      names.add(entry.fileName);
      entries.push(entry);
      if (entry.fileName !== 'dataset.json') continue;
      if (entry.uncompressedSize > DATASET_MAX_BYTES) throw invalid();
      const chunks = [];
      let bytes = 0;
      for await (const chunk of await zip.openReadStreamPromise(entry)) {
        bytes += chunk.length;
        if (bytes > DATASET_MAX_BYTES) throw invalid();
        chunks.push(chunk);
      }
      dataset = parseFrozenDataset(Buffer.concat(chunks));
    }
    if (!dataset) throw invalid();
    return { dataset, zip, entries };
  } catch (error) {
    zip?.close();
    if (error.code) throw error;
    throw invalid();
  }
}

/** Pull entry chunks on demand; cancellation releases both the ZIP and its handle. */
export function trainingDownloadStream(archive, additions, close) {
  const pending = [];
  let active, closing, cancelled = false;
  const zip = new Zip((error, data) => {
    if (error) throw error;
    if (data.length) pending.push(data);
  });
  const cleanup = () => closing ||= (async () => {
    active?.destroy();
    zip.terminate();
    archive.zip.close();
    await close();
  })();
  const chunks = (async function* () {
    try {
      for (const source of archive.entries) {
        active = await archive.zip.openReadStreamPromise(source);
        if (cancelled) { active.destroy(); return; }
        const entry = new ZipPassThrough(source.fileName);
        zip.add(entry);
        for await (const chunk of active) {
          entry.push(chunk, false);
          while (pending.length) yield pending.shift();
        }
        active = null;
        entry.push(EMPTY, true);
        while (pending.length) yield pending.shift();
      }
      for (const [name, data] of Object.entries(additions)) {
        const entry = new ZipPassThrough(name);
        zip.add(entry);
        entry.push(data, true);
        while (pending.length) yield pending.shift();
      }
      zip.end();
      while (pending.length) yield pending.shift();
    } finally { await cleanup(); }
  })();
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (cancelled) return;
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        await cleanup();
        if (!cancelled) controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      await cleanup();
      await chunks.return();
    },
  }, { highWaterMark: 0 });
}
