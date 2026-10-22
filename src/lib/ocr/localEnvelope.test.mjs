import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_LIST_LIMIT,
  ENVELOPE_PROJECTION,
  workerJobFilter,
  listFilter,
  toEnvelope,
  toListItem,
  isJobActive,
  parseListQuery,
  pageOf,
  jobInfo,
} from './localEnvelope.js';
import { WORKER_VISIBLE_STATUSES } from './localJobState.js';

// contracts/examples/job-envelope.json בריפו השירות (הועתק — הריפו אינו זמין ב-CI)
const CONTRACT_EXAMPLE = {
  schemaVersion: 1,
  jobId: 'job-0001',
  taskType: 'ocr',
  workerId: 'worker-1',
  createdAt: '2026-10-19T08:00:00+00:00',
  inputSha256: 'a'.repeat(64),
  options: { lm: 'rabbinic', defaultScript: 'square' },
  pageMap: [
    { pdfPageIndex: 1, pageId: 'p-001', pageNumber: 1, expectedUpdatedAt: '2026-10-19T08:00:00+00:00', imageSha256: 'b'.repeat(64) },
    { pdfPageIndex: 2, pageId: 'p-002', pageNumber: 2, expectedUpdatedAt: '2026-10-19T08:00:00+00:00', imageSha256: 'b'.repeat(64) },
  ],
};

const oid = (n) => n.toString(16).padStart(24, '0');
// ObjectId-like: String() מחזיר hex (כמו ObjectId של mongoose ב-lean)
const idObj = (hex) => ({ toString: () => hex });
const T = new Date('2026-10-19T08:00:00.000Z');

function dbJob(over = {}) {
  return {
    _id: idObj(oid(1)),
    taskType: 'ocr',
    workerId: 'worker-1',
    createdAt: T,
    inputSha256: 'a'.repeat(64),
    options: { lm: 'rabbinic', defaultScript: 'square' },
    pageMap: [
      { pdfPageIndex: 1, page: idObj('p-001'), pageNumber: 1, expectedUpdatedAt: T, imageSha256: 'b'.repeat(64) },
      { pdfPageIndex: 2, page: idObj('p-002'), pageNumber: 2, expectedUpdatedAt: T, imageSha256: 'b'.repeat(64) },
    ],
    cancelRequested: false,
    status: 'queued',
    active: true,
    ...over,
  };
}

const typeShape = (v) =>
  Array.isArray(v) ? v.map(typeShape) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeShape(x)])) : typeof v;

test('toEnvelope: אותם מפתחות, סדר וסוגים כמו job-envelope.json בחוזה', () => {
  const env = toEnvelope(dbJob());
  assert.deepEqual(Object.keys(env), Object.keys(CONTRACT_EXAMPLE));
  assert.deepEqual(Object.keys(env.pageMap[0]), Object.keys(CONTRACT_EXAMPLE.pageMap[0]));
  assert.deepEqual(typeShape(env), typeShape(CONTRACT_EXAMPLE));
  assert.equal(env.jobId, oid(1));
  assert.equal(env.createdAt, '2026-10-19T08:00:00.000Z');
  assert.equal(env.pageMap[1].expectedUpdatedAt, '2026-10-19T08:00:00.000Z');
  assert.equal(env.pageMap[0].pageId, 'p-001');
  // אותו רגע כמו בדוגמה (השירות משווה רגעים, לא טקסט)
  assert.equal(Date.parse(env.createdAt), Date.parse(CONTRACT_EXAMPLE.createdAt));
});

test('toEnvelope: דטרמיניסטי (אותה רשומה → אותו JSON) ו-createdAt כמחרוזת מה-DB', () => {
  assert.equal(JSON.stringify(toEnvelope(dbJob())), JSON.stringify(toEnvelope(dbJob())));
  assert.equal(toEnvelope(dbJob({ createdAt: '2026-10-19T08:00:00Z' })).createdAt, '2026-10-19T08:00:00.000Z');
});

test('toEnvelope: options — רק מפתחות שהוגדרו, ריק נשאר {}', () => {
  assert.deepEqual(toEnvelope(dbJob({ options: undefined })).options, {});
  assert.deepEqual(toEnvelope(dbJob({ options: {} })).options, {});
  assert.deepEqual(toEnvelope(dbJob({ options: { lm: 'off' } })).options, { lm: 'off' });
  assert.deepEqual(Object.keys(toEnvelope(dbJob({ options: { defaultScript: 'rashi', lm: 'modern' } })).options), ['lm', 'defaultScript']);
  assert.deepEqual(toEnvelope(dbJob({ options: { lm: null, defaultScript: 'square' } })).options, { defaultScript: 'square' });
});

test('toEnvelope: taskType חסר ברשומה → ocr', () => {
  assert.equal(toEnvelope(dbJob({ taskType: undefined })).taskType, 'ocr');
});

test('toListItem: המעטפה + cancelRequested (בוליאני תמיד) + siteState', () => {
  const item = toListItem(dbJob());
  assert.deepEqual(Object.keys(item), [...Object.keys(CONTRACT_EXAMPLE), 'cancelRequested', 'siteState']);
  assert.equal(item.cancelRequested, false);
  assert.equal(item.siteState, 'queued');
  assert.equal(toListItem(dbJob({ cancelRequested: undefined })).cancelRequested, false);
  assert.equal(toListItem(dbJob({ cancelRequested: true, status: 'running' })).cancelRequested, true);
  for (const s of ['running', 'pausing', 'paused_runner', 'delivery_pending', 'needs_attention', 'applying']) {
    assert.equal(toListItem(dbJob({ status: s })).siteState, 'in_progress', s);
  }
});

test('parseListQuery: ברירת מחדל, גבולות ו-cursor', () => {
  const q = (s) => parseListQuery(new URLSearchParams(s));
  assert.deepEqual(q(''), { limit: 100, cursor: null });
  assert.deepEqual(q('limit=100'), { limit: 100, cursor: null });
  assert.deepEqual(q('limit=1'), { limit: 1, cursor: null });
  assert.deepEqual(q('limit=500'), { limit: MAX_LIST_LIMIT, cursor: null });
  assert.deepEqual(q(`limit=100&cursor=${oid(7)}`), { limit: 100, cursor: oid(7) });
  assert.deepEqual(q('cursor='), { limit: 100, cursor: null });
  for (const bad of ['limit=0', 'limit=-1', 'limit=abc', 'limit=1.5', 'limit=', 'limit=1e3', `cursor=${oid(7).toUpperCase().replace(/0/g, 'A')}`, 'cursor=abc', 'cursor=12', `cursor=${oid(7)}x`]) {
    assert.deepEqual(q(bad), { error: 'bad_request' }, bad);
  }
});

test('pageOf: 0, 100, 101 ו-250 רשומות — nextCursor תמיד קיים ומתקדם', () => {
  const jobs = (from, n) => Array.from({ length: n }, (_, i) => dbJob({ _id: idObj(oid(from + i)) }));
  const empty = pageOf([], 100);
  assert.deepEqual(empty, { items: [], nextCursor: null });
  assert.ok(Object.hasOwn(empty, 'nextCursor'));

  const p100 = pageOf(jobs(1, 100), 100);
  assert.equal(p100.items.length, 100);
  assert.equal(p100.nextCursor, null);

  const p101 = pageOf(jobs(1, 101), 100);
  assert.equal(p101.items.length, 100);
  assert.equal(p101.nextCursor, oid(100));
  assert.equal(p101.items.at(-1).jobId, p101.nextCursor);

  // סימולציית דפדוף על 250 רשומות (השאילתה מחזירה limit+1 אחרי ה-cursor)
  const all = jobs(1, 250);
  const seen = [];
  const cursors = [];
  let cursor = null;
  do {
    const after = cursor === null ? all : all.filter((j) => String(j._id) > cursor);
    const page = pageOf(after.slice(0, 101), 100);
    seen.push(...page.items.map((i) => i.jobId));
    if (page.nextCursor !== null) {
      assert.ok(cursor === null || page.nextCursor > cursor);
      cursors.push(page.nextCursor);
    }
    cursor = page.nextCursor;
  } while (cursor !== null);
  assert.deepEqual(cursors, [oid(100), oid(200)]);
  assert.equal(seen.length, 250);
  assert.equal(new Set(seen).size, 250);
});

test('pageOf: רשומה שהסריאליזציה שלה נכשלת מדולגת לבדה, ה-cursor לפי האחרונה שנסרקה', () => {
  const ok = (n) => dbJob({ _id: idObj(oid(n)) });
  const skipped = [];
  const onSkip = (job, err) => skipped.push([String(job._id), err.name]);

  // תאריך לא תקין (toISOString זורק), תאריך חסר, ורשומת pageMap ריקה (null)
  const badCreated = dbJob({ _id: idObj(oid(2)), createdAt: 'not-a-date' });
  const noCreated = dbJob({ _id: idObj(oid(3)), createdAt: undefined });
  const badEntry = dbJob({ _id: idObj(oid(4)), pageMap: [null] });
  const p = pageOf([ok(1), badCreated, noCreated, badEntry, ok(5)], 100, onSkip);
  assert.deepEqual(p.items.map((i) => i.jobId), [oid(1), oid(5)]);
  assert.equal(p.nextCursor, null);
  assert.deepEqual(skipped, [[oid(2), 'RangeError'], [oid(3), 'RangeError'], [oid(4), 'TypeError']]);

  // הפגומה היא האחרונה בעמוד מלא: nextCursor = המזהה שלה (לא של האחרונה שהוחזרה), כך שהעמוד
  // הבא מתחיל אחריה ולא חוזר עליה
  const jobs = Array.from({ length: 101 }, (_, i) => (i === 99 ? dbJob({ _id: idObj(oid(100)), createdAt: 'x' }) : ok(i + 1)));
  const full = pageOf(jobs, 100, () => {});
  assert.equal(full.items.length, 99);
  assert.equal(full.items.at(-1).jobId, oid(99));
  assert.equal(full.nextCursor, oid(100));

  // כל העמוד פגום: items ריק, אבל nextCursor עדיין מתקדם
  const allBad = Array.from({ length: 3 }, (_, i) => dbJob({ _id: idObj(oid(i + 1)), createdAt: 'x' }));
  assert.deepEqual(pageOf(allBad, 2, () => {}), { items: [], nextCursor: oid(2) });
});

test('pageOf: ברירת המחדל רושמת בלוג רק jobId וקוד — בלי הודעת החריגה ובלי נתוני הרשומה', (t) => {
  const err = t.mock.method(console, 'error', () => {});
  pageOf([dbJob({ _id: idObj(oid(9)), createdAt: 'secret-path-C:\\x' })], 100);
  assert.equal(err.mock.callCount(), 1);
  assert.deepEqual(err.mock.calls[0].arguments, [`[ocr-worker] list item skipped: jobId=${oid(9)} code=RangeError`]);
});

test('isJobActive / jobInfo: closed הפוך מ-activeFilter, ack רק כשנשמר', () => {
  assert.equal(isJobActive({ active: true, status: 'queued' }), true);
  assert.equal(isJobActive({ active: false, status: 'running' }), false);
  assert.equal(isJobActive({ status: 'running' }), true); // רשומה ישנה בלי השדה
  assert.equal(isJobActive({ status: 'completed' }), false);

  const open = jobInfo({ _id: idObj(oid(5)), status: 'running', active: true, cancelRequested: false, ack: null });
  assert.deepEqual(open, { jobId: oid(5), state: 'in_progress', cancelRequested: false, closed: false });
  assert.equal(Object.hasOwn(open, 'ack'), false);

  const ack = { ack: 'accepted', jobId: oid(5), resultSha256: 'c'.repeat(64), outcome: 'partial' };
  assert.deepEqual(jobInfo({ _id: idObj(oid(5)), status: 'completed', active: false, ack }), {
    jobId: oid(5),
    state: 'closed',
    cancelRequested: false,
    closed: true,
    ack,
  });

  const cancelled = jobInfo({ _id: idObj(oid(6)), status: 'cancelled', active: false, cancelRequested: true });
  assert.deepEqual(cancelled, { jobId: oid(6), state: 'cancelled', cancelRequested: true, closed: true });
  assert.equal(jobInfo({ _id: idObj(oid(6)), status: 'queued', active: true }).state, 'queued');
});

test('פילטרים: רק local של העובד עם קלט; ברשימה גם פעילה, גלויה, ואחרי ה-cursor', () => {
  assert.deepEqual(workerJobFilter('w'), { method: 'local', workerId: 'w', inputSha256: { $type: 'string' } });
  const f = listFilter('w', null);
  assert.equal(f.method, 'local');
  assert.equal(f.workerId, 'w');
  assert.ok(Array.isArray(f.$or));
  assert.deepEqual(f.status, { $in: WORKER_VISIBLE_STATUSES });
  assert.equal(f.status.$in.includes('preparing'), false);
  assert.equal(Object.hasOwn(f, '_id'), false);
  assert.deepEqual(listFilter('w', oid(9))._id, { $gt: oid(9) });
  for (const k of ['_id', 'workerId', 'createdAt', 'inputSha256', 'options', 'pageMap', 'cancelRequested', 'status', 'taskType']) {
    assert.equal(ENVELOPE_PROJECTION[k], 1, k);
  }
});
