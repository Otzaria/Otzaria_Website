import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { validateAppReport, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_TOTAL_BYTES, MAX_BODY_BYTES } from './validation.js';
import { readJsonBodyLimited } from '../corrections/report-email.js';
import { ANIMATED_GIF } from './testing/gif-fixtures.js';

const mib = 1024 * 1024;
const report = (attachments, schema = 2) => ({
  schema, reportId: 'attachment-boundary', type: 'bug', trigger: 'manual',
  title: 'דיווח עם צרופות', description: 'תיאור הבדיקה', reporterEmail: 'test@example.com',
  platform: 'windows', appVersion: '1.0.0', attachments,
});
const image = (bytes) => ({ fileName: 'recording.gif', data: bytes.toString('base64') });
const gifOfSize = (size) => Buffer.concat([ANIMATED_GIF, Buffer.alloc(size - ANIMATED_GIF.length)]);
const dumpOfSize = (size) => {
  const bytes = Buffer.alloc(size);
  bytes.write('MDMP');
  return bytes;
};

test('חוזה משותף: payload אמיתי מ־Dart מפוענח עם אותם בתים, ניקוד ו־GIF מונפש', async () => {
  const fixture = JSON.parse(await readFile(new URL('./testing/app-report-schema2.json', import.meta.url), 'utf8'));
  const result = await validateAppReport(fixture.payload);
  assert.equal(result.ok, true);
  const value = result.value;
  assert.equal(value.schema, 2);
  assert.deepEqual(value.diagnostics, fixture.stored.diagnostics);
  assert.equal(value.errorLog, fixture.stored.errorLog);
  assert.equal(value.images[0].mimeType, 'image/gif');
  assert.deepEqual(value.images[0].buffer, Buffer.from(fixture.stored.images[0].data, 'base64'));
  assert.equal(value.images[0].buffer.length, fixture.imageBytes);
  assert.equal(value.minidump.buffer.length, fixture.dumpRawBytes);
  assert.equal(value.images[0].buffer.length + value.minidump.buffer.length
    + Buffer.byteLength(value.errorLog) + Buffer.byteLength(JSON.stringify(value.diagnostics)), fixture.attachmentBytes);
});

test('schema2: קובץ בגבול10MiB מתקבל; חריגה בבית אחד נדחית', async () => {
  assert.equal(MAX_ATTACHMENT_BYTES, 10 * mib);
  for (const extra of [0, 1]) {
    const bytes = gifOfSize(10 * mib + extra);
    const result = await validateAppReport(report({ images: [image(bytes)] }));
    assert.equal(result.ok, extra === 0);
    if (result.ok) {
      assert.equal(result.value.schema, 2);
      assert.deepEqual(result.value.images[0].buffer, bytes);
    } else assert.equal(result.field, 'attachments.images[0]');
  }
});

test('schema2: סך20MiB מדויק מתקבל; בית נוסף מכל סוג צרופה נדחה', async () => {
  assert.equal(MAX_ATTACHMENTS_TOTAL_BYTES, 20 * mib);
  const full = [image(gifOfSize(10 * mib)), image(gifOfSize(10 * mib))];
  assert.equal((await validateAppReport(report({ images: full }))).ok, true);
  assert.equal((await validateAppReport(report({ images: [...full, image(ANIMATED_GIF)] }))).field, 'attachments.images');
  assert.equal((await validateAppReport(report({ images: full, errorLog: 'x' }))).field, 'attachments');
  const overByOne = [image(gifOfSize(10 * mib)), image(gifOfSize(10 * mib - ANIMATED_GIF.length + 1)), image(ANIMATED_GIF)];
  assert.equal((await validateAppReport(report({ images: overByOne }))).field, 'attachments.images');

  const withoutOne = report({ images: [full[0], image(ANIMATED_GIF)] });
  assert.equal((await validateAppReport(withoutOne)).ok, true);
  assert.equal((await validateAppReport(report({ images: full }))).ok, true);
});

test('schema2: הסכום כולל UTF8 של אבחון ולוג ו־dump לפני דחיסה', async () => {
  const diagnostics = { text: 'נִקּוּד 😀' };
  const errorLog = 'שגיאה\n';
  const extraBytes = Buffer.byteLength(JSON.stringify(diagnostics)) + Buffer.byteLength(errorLog);
  const minidump = { fileName: 'crash.dmp', data: gzipSync(dumpOfSize(10 * mib)).toString('base64') };
  const base = { diagnostics, errorLog, minidump };
  assert.equal((await validateAppReport(report({ ...base, images: [image(gifOfSize(10 * mib - extraBytes))] }))).ok, true);
  assert.equal((await validateAppReport(report({ ...base, images: [image(gifOfSize(10 * mib - extraBytes + 1))] }))).field, 'attachments');
  assert.equal((await validateAppReport(report({ images: [image(gifOfSize(10 * mib)), image(gifOfSize(10 * mib - 2))], diagnostics: {} }))).ok, true);
});

test('schema2: אבחון ולוג מקבלים10MiB כל אחד, בלי תקרות legacy ובלי חיתוך', async () => {
  const diagnostics = { text: 'x'.repeat(10 * mib - 11) };
  const errorLog = '\0'.repeat(10 * mib);
  assert.equal(Buffer.byteLength(JSON.stringify(diagnostics)), 10 * mib);
  const accepted = await validateAppReport(report({ diagnostics, errorLog }));
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.value.diagnostics, diagnostics);
  assert.equal(accepted.value.errorLog, errorLog);
  assert.equal((await validateAppReport(report({ diagnostics: { text: diagnostics.text + 'x' } }))).field, 'attachments.diagnostics');
  assert.equal((await validateAppReport(report({ errorLog: errorLog + 'x' }))).field, 'attachments.errorLog');
  assert.equal((await validateAppReport(report({ diagnostics, errorLog, images: [image(ANIMATED_GIF)] }))).field, 'attachments');
  assert.equal((await validateAppReport(report({ diagnostics }, 1))).field, 'attachments.diagnostics');
  assert.equal((await validateAppReport(report({ errorLog }, 1))).field, 'attachments.errorLog');
});

test('גוף תקין עם10MiB של תווי בקרה בלוג ו10MiB אבחון עובר אחרי JSON escaping', async () => {
  assert.equal(MAX_BODY_BYTES, 128 * mib);
  const raw = report({ diagnostics: { text: 'x'.repeat(10 * mib - 11) }, errorLog: '\0'.repeat(10 * mib) });
  const body = JSON.stringify(raw);
  assert.ok(Buffer.byteLength(body) > 70 * mib);
  assert.ok(Buffer.byteLength(body) < MAX_BODY_BYTES);
  const parsed = await readJsonBodyLimited(new Request('http://localhost/api/app-reports', { method: 'POST', body }), MAX_BODY_BYTES);
  assert.equal(parsed.attachments.errorLog.length, 10 * mib);
  assert.equal((await validateAppReport(parsed)).ok, true);
});

test('schema2: dump לא דחיס בגבול מתקבל גם עם תקורתgzip; פלט גדול בבית אחד נדחה', async () => {
  const bytes = randomBytes(10 * mib);
  bytes.write('MDMP');
  const gzip = gzipSync(bytes);
  assert.ok(gzip.length > bytes.length);
  for (const input of [bytes, gzip]) {
    const result = await validateAppReport(report({ minidump: { data: input.toString('base64') } }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.minidump.buffer, bytes);
  }
  for (const input of [dumpOfSize(10 * mib + 1), gzipSync(dumpOfSize(10 * mib + 1))]) {
    assert.equal((await validateAppReport(report({ minidump: { data: input.toString('base64') } }))).field, 'attachments.minidump');
  }
});

test('GIF מונפש נשמר ללא שינוי בשתי גרסאות החוזה', async () => {
  for (const schema of [1, 2]) {
    const result = await validateAppReport(report({ images: [image(ANIMATED_GIF)] }, schema));
    assert.equal(result.ok, true);
    assert.equal(result.value.images[0].mimeType, 'image/gif');
    assert.deepEqual(result.value.images[0].buffer, ANIMATED_GIF);
  }
});

test('schema1 ישן ממשיך לקבל את16MiB האבחון וה15MiB של התמונות שלו', async () => {
  const attachments = {
    images: Array.from({ length: 3 }, () => image(gifOfSize(5 * mib))),
    minidump: { data: dumpOfSize(16 * mib).toString('base64') },
    diagnostics: { text: 'x'.repeat(300 * 1024 - 11) }, errorLog: '\0'.repeat(250 * 1024),
  };
  const raw = report(attachments, 1);
  const request = new Request('http://localhost/api/app-reports', { method: 'POST', body: JSON.stringify(raw) });
  const parsed = await readJsonBodyLimited(request, MAX_BODY_BYTES);
  assert.equal((await validateAppReport(parsed)).ok, true);
  assert.equal((await validateAppReport(report(attachments, 2))).field, 'attachments.minidump');
  assert.equal((await validateAppReport(report({ images: [image(gifOfSize(5 * mib + 1))] }, 1))).field, 'attachments.images[0]');
});

test('גוףschema2 מלא עובר גם בקריאתstream בליContent-Length; גוף מעל תקרת התעבורה נעצר', async () => {
  const raw = report({ images: [image(gifOfSize(10 * mib)), image(gifOfSize(10 * mib))] });
  const encoded = Buffer.from(JSON.stringify(raw));
  assert.ok(encoded.length > 20 * mib);
  assert.ok(encoded.length < MAX_BODY_BYTES);
  let offset = 0;
  const body = new ReadableStream({ pull(controller) {
    if (offset === encoded.length) return controller.close();
    const end = Math.min(encoded.length, offset + 65536);
    controller.enqueue(encoded.subarray(offset, end));
    offset = end;
  } });
  const parsed = await readJsonBodyLimited(new Request('http://localhost', { method: 'POST', body, duplex: 'half' }), MAX_BODY_BYTES);
  assert.equal((await validateAppReport(parsed)).ok, true);
  await assert.rejects(readJsonBodyLimited(new Request('http://localhost', {
    method: 'POST', headers: { 'Content-Length': String(MAX_BODY_BYTES + 1) }, body: '{}',
  }), MAX_BODY_BYTES), { code: 'BODY_TOO_LARGE' });
});
