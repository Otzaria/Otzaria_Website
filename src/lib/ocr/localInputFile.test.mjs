import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { writeJobFileDurable } from './localStorage.js';
import { fileHandleStream, openJobInput } from './localInputFile.js';

const JOB = '64b7f0c2a1b2c3d4e5f60002';
const sha = (b) => createHash('sha256').update(b).digest('hex');
let tmp;
let env;

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-local-input-'));
  env = { OCR_LOCAL_STORAGE_DIR: path.join(tmp, 'root') };
});
after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function readAll(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

async function storedJob(bytes, jobId = JOB) {
  const w = await writeJobFileDurable(jobId, 'input', bytes, env);
  return { _id: { toString: () => jobId }, inputPath: w.relPath, inputSha256: w.sha256, inputBytes: w.bytes, absPath: w.absPath };
}

test('openJobInput: בייטים זהים, גודל ו-sha נכונים (כמה חלקים)', async () => {
  const bytes = randomBytes(700 * 1024 + 13);
  const job = await storedJob(bytes);
  const r = await openJobInput(job, env);
  assert.equal(r.ok, true);
  assert.equal(r.size, bytes.length);
  assert.equal(r.sha256, sha(bytes));
  const got = await readAll(r.stream);
  assert.equal(sha(got), job.inputSha256);
  assert.equal(got.length, bytes.length);
});

test('openJobInput: בלי inputPath או אחרי ניקוי → 404 input_unavailable', async () => {
  const job = await storedJob(Buffer.from('%PDF-a'));
  assert.deepEqual(await openJobInput({ ...job, inputPath: undefined }, env), { ok: false, status: 404, code: 'input_unavailable' });
  assert.deepEqual(await openJobInput({ ...job, inputPurgedAt: new Date() }, env), { ok: false, status: 404, code: 'input_unavailable' });
});

test('openJobInput: קובץ שנמחק → 404 input_unavailable; שורש האחסון חסר → 503 storage_unavailable', async () => {
  const job = await storedJob(Buffer.from('%PDF-deleted'));
  await fs.rm(job.absPath);
  assert.deepEqual(await openJobInput(job, env), { ok: false, status: 404, code: 'input_unavailable' });
  await fs.rm(path.dirname(job.absPath), { recursive: true });
  assert.deepEqual(await openJobInput(job, env), { ok: false, status: 404, code: 'input_unavailable' });
  const missingRoot = { OCR_LOCAL_STORAGE_DIR: path.join(tmp, 'not-mounted') };
  assert.deepEqual(await openJobInput(job, missingRoot), { ok: false, status: 503, code: 'storage_unavailable', retryAfter: 300 });
});

test('openJobInput: גודל שונה מ-inputBytes / נתיב שלא תואם ל-hash → 409 input_corrupt', async () => {
  const job = await storedJob(Buffer.from('%PDF-size'));
  assert.deepEqual(await openJobInput({ ...job, inputBytes: job.inputBytes + 1 }, env), { ok: false, status: 409, code: 'input_corrupt' });
  assert.deepEqual(await openJobInput({ ...job, inputBytes: undefined }, env), { ok: false, status: 409, code: 'input_corrupt' });
  // רשומה שמפנה לקובץ אחר / sha אחר / jobId אחר / traversal
  assert.equal((await openJobInput({ ...job, inputSha256: 'f'.repeat(64) }, env)).code, 'input_corrupt');
  assert.equal((await openJobInput({ ...job, _id: { toString: () => '64b7f0c2a1b2c3d4e5f60009' } }, env)).code, 'input_corrupt');
  assert.equal((await openJobInput({ ...job, inputPath: `../${job.inputPath}` }, env)).code, 'input_corrupt');
  assert.equal((await openJobInput({ ...job, inputSha256: 'nothex' }, env)).code, 'input_corrupt');
});

test('openJobInput: קובץ שנמחק אחרי הפתיחה עדיין מוגש במלואו (אותו handle)', async (t) => {
  const bytes = randomBytes(300 * 1024);
  const job = await storedJob(bytes, '64b7f0c2a1b2c3d4e5f60003');
  const r = await openJobInput(job, env);
  assert.equal(r.ok, true);
  try {
    await fs.rm(job.absPath);
  } catch (err) {
    // Windows: אי אפשר למחוק קובץ פתוח בלי FILE_SHARE_DELETE — הבדיקה רלוונטית ל-Linux (ה-VPS)
    if (err?.code !== 'EPERM' && err?.code !== 'EBUSY') throw err;
    t.diagnostic('delete of an open file not allowed on this OS');
  }
  assert.equal(sha(await readAll(r.stream)), sha(bytes));
});

// FileHandle מדומה שסופר קריאות — לבדיקת backpressure וסגירה
function fakeHandle(total) {
  const h = {
    reads: 0,
    closed: 0,
    async read(buf, off, len, pos) {
      h.reads++;
      const n = Math.max(0, Math.min(len, total - pos));
      buf.fill(7, off, off + n);
      return { bytesRead: n, buffer: buf };
    },
    async close() {
      h.closed++;
    },
  };
  return h;
}

test('fileHandleStream: קורא מהדיסק רק לפי דרישה (backpressure), בדיוק size בתים', async () => {
  const fh = fakeHandle(10 * 1024);
  const stream = fileHandleStream(fh, 10 * 1024, { chunkSize: 1024 });
  const reader = stream.getReader();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(fh.reads <= 1, `reads before consuming: ${fh.reads}`);
  const first = await reader.read();
  assert.equal(first.value.byteLength, 1024);
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(fh.reads <= 2, `reads after one chunk: ${fh.reads}`);
  let total = first.value.byteLength;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
  }
  assert.equal(total, 10 * 1024);
  assert.equal(fh.closed, 1);
});

test('fileHandleStream: ביטול (הלקוח התנתק) סוגר את ה-handle', async () => {
  const fh = fakeHandle(1 << 20);
  const reader = fileHandleStream(fh, 1 << 20, { chunkSize: 4096 }).getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(fh.closed, 1);
});

test('fileHandleStream: קובץ שהתקצר באמצע → שגיאה (לא קובץ קצר "תקין")', async () => {
  const fh = fakeHandle(1000);
  const reader = fileHandleStream(fh, 5000, { chunkSize: 512 }).getReader();
  await assert.rejects(async () => {
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
  }, /input_truncated/);
  assert.equal(fh.closed, 1);
});
