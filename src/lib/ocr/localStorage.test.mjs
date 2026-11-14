import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  storageRoot,
  jobDir,
  jobFileName,
  relToAbs,
  absToRel,
  writeFileDurable,
  writeJobFileDurable,
  sha256File,
  removeQuiet,
  sweepTmpFiles,
} from './localStorage.js';

const JOB = '64b7f0c2a1b2c3d4e5f60001';
const sha = (b) => createHash('sha256').update(b).digest('hex');
let tmp;
let env;

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-local-storage-'));
  env = { OCR_LOCAL_STORAGE_DIR: path.join(tmp, 'root') };
});
after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

test('storageRoot: מה-env, אחרת storage/ocr-local תחת cwd (לא public)', () => {
  assert.equal(storageRoot(env), path.resolve(tmp, 'root'));
  assert.equal(storageRoot({}), path.resolve(process.cwd(), 'storage', 'ocr-local'));
  assert.equal(storageRoot({ OCR_LOCAL_STORAGE_DIR: '   ' }), path.resolve(process.cwd(), 'storage', 'ocr-local'));
  assert.ok(!storageRoot({}).split(path.sep).includes('public'));
});

test('jobDir: רק 24 hex קטנות', () => {
  assert.equal(jobDir(JOB, env), path.join(storageRoot(env), JOB));
  for (const bad of ['..', '../x', JOB.toUpperCase(), 'abc', '', undefined, `${JOB}/..`, 'CON']) {
    assert.throws(() => jobDir(bad, env), /invalid_job_id/, String(bad));
  }
});

test('jobFileName', () => {
  assert.equal(jobFileName('input', 'a'.repeat(64)), `input-${'a'.repeat(64)}.pdf`);
  assert.equal(jobFileName('result', 'b'.repeat(64)), `result-${'b'.repeat(64)}.json`);
  assert.equal(jobFileName('rejected', 'c'.repeat(64)), `rejected-${'c'.repeat(64)}.json`);
  assert.throws(() => jobFileName('toString', 'a'.repeat(64)), /invalid_file_kind/);
  assert.throws(() => jobFileName('input', 'A'.repeat(64)), /invalid_sha256/);
  assert.throws(() => jobFileName('input', '../x'), /invalid_sha256/);
});

test('relToAbs / absToRel: הלוך-חזור, ודחיית traversal', () => {
  const rel = `${JOB}/input-${'a'.repeat(64)}.pdf`;
  const abs = relToAbs(rel, env);
  assert.equal(abs, path.join(storageRoot(env), JOB, `input-${'a'.repeat(64)}.pdf`));
  assert.equal(absToRel(abs, env), rel);
  const bad = ['', '..', '../x', `${JOB}/../../x`, `/${JOB}/a`, `${JOB}\\a`, 'C:/x', `${JOB}//a`, `${JOB}/./a`, 'a\0b', '.', 'x'.repeat(600)];
  for (const r of bad) assert.throws(() => relToAbs(r, env), /invalid_storage_path/, JSON.stringify(r));
  assert.throws(() => relToAbs(42, env), /invalid_storage_path/);
  assert.throws(() => absToRel(path.join(tmp, 'elsewhere'), env), /invalid_storage_path/);
  assert.throws(() => absToRel(storageRoot(env), env), /invalid_storage_path/);
});

const listDir = async (d) => (await fs.readdir(d)).sort();

test('writeFileDurable: כותב, מחזיר bytes+sha256 ולא משאיר קובץ זמני', async () => {
  const dir = path.join(storageRoot(env), 'plain');
  const target = path.join(dir, 'a.json');
  const r = await writeFileDurable(target, '{"שלום":1}');
  const buf = await fs.readFile(target);
  assert.deepEqual(r, { bytes: buf.length, sha256: sha(buf) });
  assert.deepEqual(await listDir(dir), ['a.json']);
  // דריסה עם תוכן אחר — עדיין אטומית ובלי שאריות
  await writeFileDurable(target, Buffer.from('x'));
  assert.equal(await fs.readFile(target, 'utf8'), 'x');
  assert.deepEqual(await listDir(dir), ['a.json']);
});

test('writeFileDurable: iterable אסינכרוני; כשל באמצע — הקובץ הזמני נמחק והיעד לא נוצר', async () => {
  const dir = path.join(storageRoot(env), 'iter');
  async function* gen() {
    yield Buffer.from('ab');
    yield new Uint8Array([99]);
    yield 'd';
  }
  const r = await writeFileDurable(path.join(dir, 'ok.bin'), gen());
  assert.equal(await fs.readFile(path.join(dir, 'ok.bin'), 'utf8'), 'abcd');
  assert.equal(r.sha256, sha('abcd'));
  async function* failing() {
    yield Buffer.from('partial');
    throw new Error('stream broke');
  }
  await assert.rejects(writeFileDurable(path.join(dir, 'bad.bin'), failing()), /stream broke/);
  assert.deepEqual(await listDir(dir), ['ok.bin']);
  await assert.rejects(writeFileDurable(path.join(dir, 'n.bin'), 123), /unsupported_data/);
  assert.deepEqual(await listDir(dir), ['ok.bin']);
});

test('writeJobFileDurable: שם לפי תוכן, נתיב יחסי, וקובץ קיים לא מוחלף', async () => {
  const data = Buffer.from('%PDF-1.7 fake');
  const r1 = await writeJobFileDurable(JOB, 'input', data, env);
  assert.equal(r1.sha256, sha(data));
  assert.equal(r1.bytes, data.length);
  assert.equal(r1.relPath, `${JOB}/input-${sha(data)}.pdf`);
  assert.equal(r1.absPath, relToAbs(r1.relPath, env));
  assert.equal(r1.reused, false);
  const st1 = await fs.stat(r1.absPath);

  await new Promise((r) => setTimeout(r, 20));
  const r2 = await writeJobFileDurable(JOB, 'input', data, env);
  assert.equal(r2.reused, true);
  assert.equal(r2.relPath, r1.relPath);
  const st2 = await fs.stat(r1.absPath);
  assert.equal(st2.mtimeMs, st1.mtimeMs, 'הקובץ הקיים לא נכתב מחדש');
  assert.deepEqual(await listDir(jobDir(JOB, env)), [`input-${sha(data)}.pdf`]);

  // קובץ קיים פגום באותו שם (גודל/תוכן שונה) — מתוקן לתוכן הנכון
  await fs.writeFile(r1.absPath, 'garbage');
  const r3 = await writeJobFileDurable(JOB, 'input', data, env);
  assert.equal(r3.reused, false);
  assert.deepEqual(await fs.readFile(r1.absPath), data);
  assert.equal(await sha256File(r1.absPath), sha(data));

  await assert.rejects(writeJobFileDurable('../x', 'input', data, env), /invalid_job_id/);
  await assert.rejects(writeJobFileDurable(JOB, 'other', data, env), /invalid_file_kind/);
  assert.deepEqual(await listDir(jobDir(JOB, env)), [`input-${sha(data)}.pdf`]);
});

test('writeJobFileDurable עם expectedSha256 שגוי: הקובץ הסופי לא נוצר ולא נוגעים בקובץ קיים באותו שם', async () => {
  const JOB2 = '64b7f0c2a1b2c3d4e5f60002';
  const data = Buffer.from('{"result":1}');
  const final = path.join(jobDir(JOB2, env), jobFileName('result', sha(data)));

  // אין קובץ סופי: mismatch → לא נוצר כלום (גם לא זמני)
  const r1 = await writeJobFileDurable(JOB2, 'result', data, env, { expectedSha256: 'f'.repeat(64) });
  assert.deepEqual(r1, { mismatch: true, relPath: null, absPath: null, bytes: data.length, sha256: sha(data), reused: false });
  assert.deepEqual(await listDir(jobDir(JOB2, env)), []);

  // קובץ באותו שם כבר קיים (של בקשה מקבילה) — גם אם תוכנו שונה, לא מוחלף ולא נמחק
  await fs.writeFile(final, 'locked-by-another-request');
  const r2 = await writeJobFileDurable(JOB2, 'result', data, env, { expectedSha256: 'f'.repeat(64) });
  assert.equal(r2.mismatch, true);
  assert.equal(await fs.readFile(final, 'utf8'), 'locked-by-another-request');
  assert.deepEqual(await listDir(jobDir(JOB2, env)), [path.basename(final)]);

  // expectedSha256 תואם — כרגיל
  const r3 = await writeJobFileDurable(JOB2, 'result', data, env, { expectedSha256: sha(data) });
  assert.equal(r3.mismatch, undefined);
  assert.deepEqual(await fs.readFile(final), data);
});

test('removeQuiet: לא זורק על קובץ שאינו קיים', async () => {
  await removeQuiet(path.join(tmp, 'nope', 'x'));
});

test('sweepTmpFiles: מוחק רק קבצים זמניים ישנים, בשורש ובתיקיות עבודה', async () => {
  const root = path.join(tmp, 'sweep');
  const senv = { OCR_LOCAL_STORAGE_DIR: root };
  const jd = path.join(root, JOB);
  const other = path.join(root, 'not-a-job');
  await fs.mkdir(jd, { recursive: true });
  await fs.mkdir(other, { recursive: true });
  const files = {
    oldTmp: path.join(jd, 'input.tmp-0123456789abcdef'),
    newTmp: path.join(jd, 'input.tmp-fedcba9876543210'),
    final: path.join(jd, `input-${'a'.repeat(64)}.pdf`),
    rootOldTmp: path.join(root, 'x.json.tmp-aaaaaaaaaaaaaaaa'),
    notTmp: path.join(jd, 'notes.tmp'),
    otherDirTmp: path.join(other, 'y.tmp-bbbbbbbbbbbbbbbb'),
  };
  for (const f of Object.values(files)) await fs.writeFile(f, 'x');
  const old = new Date(Date.now() - 2 * 3600_000);
  for (const k of ['oldTmp', 'final', 'rootOldTmp', 'notTmp', 'otherDirTmp']) await fs.utimes(files[k], old, old);

  const removed = await sweepTmpFiles(3600_000, { env: senv });
  assert.equal(removed, 2);
  const exists = async (f) => !!(await fs.stat(f).catch(() => null));
  assert.equal(await exists(files.oldTmp), false);
  assert.equal(await exists(files.rootOldTmp), false);
  for (const k of ['newTmp', 'final', 'notTmp', 'otherDirTmp']) assert.equal(await exists(files[k]), true, k);
  assert.equal(await sweepTmpFiles(1000, { env: { OCR_LOCAL_STORAGE_DIR: path.join(tmp, 'missing') } }), 0);
});
