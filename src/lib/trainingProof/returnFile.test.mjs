/**
 * קובץ-ההחזרה לתחנה (docs/76 §5): שורה לכל חלק, רק מאושרים, בלי "דלג",
 * מזהה-מתנדב אטום, ו-ZIP אמיתי שנפתח ונבדק.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { resultLine, buildReturnZip, volId, newExportId, checkReturnLine, checkReturnManifest } from './returnFile.js';
import { ocrItem, routerItem, framesItem } from './testFixtures.js';

const USER = '64b7f0c2a1b2c3d4e5f60003';
const at = new Date('2026-10-28T17:02:11Z');
const ok = new Date('2026-10-29T19:55:00Z');

const approved = (section, payload, result, extra = {}) => ({
  uid: payload.uid,
  sig: payload.sig,
  packageId: 'tp-20261027-1f3a9c2e',
  section,
  status: 'approved',
  payload,
  result,
  vol: USER,
  submittedAt: at,
  reviewedAt: ok,
  adminFixed: false,
  ...extra,
});

test('volId: אטום, יציב, בלי המזהה עצמו', () => {
  assert.match(volId(USER), /^v-[0-9a-f]{8}$/);
  assert.equal(volId(USER), volId(USER));
  assert.notEqual(volId(USER), volId('64b7f0c2a1b2c3d4e5f60004'));
  assert.match(newExportId(new Date('2026-10-29T10:00:00Z'), 'a1b2c3'), /^tpx-20261029-a1b2c3$/);
});

test('ocr: fixed נושא טקסט; ok בלי; "דלג" ופריט שלא אושר — לא יוצאים', () => {
  const l = resultLine(approved('ocr', ocrItem(0), { action: 'fixed', text: 'אמר רבי יצחק' }, { adminFixed: true }));
  assert.deepEqual(Object.keys(l), ['uid', 'sig', 'package_id', 'action', 'text', 'admin_fixed', 'vol', 'at', 'approved_at']);
  assert.equal(l.admin_fixed, true);
  assert.equal(l.vol, volId(USER));
  assert.equal(l.at, '2026-10-28T17:02:11.000Z');
  assert.equal(checkReturnLine('ocr', l), null);
  assert.equal('text' in resultLine(approved('ocr', ocrItem(0), { action: 'ok' })), false);
  assert.throws(() => resultLine(approved('ocr', ocrItem(0), { action: 'skip' })), /אינה יוצאת/);
  assert.throws(() => resultLine({ ...approved('ocr', ocrItem(0), { action: 'ok' }), status: 'submitted' }), /לא אושר/);
});

test('router: פסול = label ריק; מעורבת עם מילים ו-words_src; לא-מעורבת בלי מילים', () => {
  const bad = resultLine(approved('router', routerItem(0), { label: '', bad: true }));
  assert.deepEqual([bad.label, bad.bad, 'words' in bad], ['', true, false]);
  assert.equal(checkReturnLine('router', bad), null);
  const words = [{ k: 0, box: [449, 0, 520, 54], label: 'square' }, { k: 1, box: [290, 0, 365, 54], label: 'rashi' }];
  const mixed = resultLine(approved('router', routerItem(0), { label: 'mixed', bad: false, words, words_src: 'site' }));
  assert.equal(mixed.words_src, 'site');
  assert.deepEqual(mixed.words, words);
  assert.equal(checkReturnLine('router', mixed), null);
  const plain = resultLine(approved('router', routerItem(0), { label: 'rashi', bad: false }));
  assert.equal('words' in plain, false);
  assert.equal(checkReturnLine('router', plain), null);
});

test('frames: כל המסגרות, status, streams_added, book/page מה-payload', () => {
  const p = framesItem(0);
  const l = resultLine(approved('frames', p, { status: 'marked', frames: p.frames, streams_added: [] }));
  assert.equal(l.book, p.book);
  assert.equal(l.page, p.page);
  assert.equal(l.scale, 1);
  assert.equal(checkReturnLine('frames', l), null);
  assert.equal('streams_changed' in l, false);
  // סוג חדש לזרם מהתחנה (שדה רשות, 2026-11-01) — רק כשיש
  const ch = [{ id: 's2', role: 'notes', from: 'commentary' }];
  const lc = resultLine(approved('frames', p, { status: 'marked', frames: p.frames, streams_added: [], streams_changed: ch }));
  assert.deepEqual(lc.streams_changed, ch);
  assert.equal(checkReturnLine('frames', lc), null);
  assert.match(checkReturnLine('frames', { ...lc, streams_changed: [{ id: 's2' }] }), /streams_changed/);
  // בגלאי admin_fixed הוא רשות (§5.3), בזיהוי ובנתב — חובה
  const { admin_fixed: _drop, ...noFlag } = l;
  assert.equal(checkReturnLine('frames', noFlag), null);
  const ocrLine = resultLine(approved('ocr', ocrItem(0), { action: 'ok' }));
  delete ocrLine.admin_fixed;
  assert.match(checkReturnLine('ocr', ocrLine), /admin_fixed/);
  // export_id של האתר הוא tpx-YYYYMMDD-xxxxxx; הבדיקה מקבלת כל tpx- (גם קובצי-הדוגמה של התחנה)
  assert.equal(checkReturnManifest({ contract: 'tp/1', direction: 'to-station', section: 'frames', export_id: 'tpx-sample-frames', station_ids: ['st-b863b68a'], packages: [], counts: { items: 0 } }), null);
});

test('buildReturnZip: manifest + results.jsonl בלבד, נפתח ונבדק', () => {
  const items = [
    approved('ocr', ocrItem(0), { action: 'ok' }),
    approved('ocr', ocrItem(1), { action: 'router' }, { packageId: 'tp-20261028-00000001' }),
  ];
  const stationOf = () => 'st-6b1e0d5a';
  const { bytes, manifest } = buildReturnZip('ocr', items, { stationOf, exportId: 'tpx-20261029-a1b2c3', now: ok });
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files).sort(), ['manifest.json', 'results.jsonl']);
  const m = JSON.parse(strFromU8(files['manifest.json']));
  assert.deepEqual(m, manifest);
  assert.equal(checkReturnManifest(m), null);
  assert.deepEqual(m.station_ids, ['st-6b1e0d5a']);
  assert.deepEqual(m.packages, ['tp-20261027-1f3a9c2e', 'tp-20261028-00000001']);
  assert.equal(m.counts.items, 2);
  const lines = strFromU8(files['results.jsonl']).trim().split('\n').map((s) => JSON.parse(s));
  assert.equal(lines.length, 2);
  assert.ok(lines.every((l) => checkReturnLine('ocr', l) === null));
  assert.throws(() => buildReturnZip('router', items, { stationOf }), /חלק אחר/);
});
