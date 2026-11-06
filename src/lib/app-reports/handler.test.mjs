import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAppReportAdmission, handleAppReportPost } from './handler.js';

const request = (body = '{}', headers = {}) => new Request('https://example.test/api/app-reports', {
  method: 'POST', body, headers,
});

const deps = (admission, extra = {}) => ({
  admission,
  rateLimit: () => true,
  connectDB: async () => {},
  ingest: async () => ({ status: 200, body: { success: true } }),
  config: {},
  saveFile: async () => {},
  deleteFile: async () => {},
  ...extra,
});

test('admission דוחה Content-Length מעל התקרה לפני קריאת הגוף', async () => {
  const admission = createAppReportAdmission();
  const req = new Request('https://example.test/api/app-reports', {
    method: 'POST',
    headers: { 'content-length': String(128 * 1024 * 1024 + 1) },
    body: '{}',
    duplex: 'half',
  });
  const response = await handleAppReportPost(req, deps(admission));
  assert.equal(response.status, 413);
  assert.equal(req.bodyUsed, false);
});

test('ה-permit נשמר עד סוף הקליטה, מחזיר 503 עם Retry-After ומשתחרר גם להמשך', async () => {
  const size = Buffer.byteLength('{}');
  const admission = createAppReportAdmission({ maxInflightBytes: size, minReservationBytes: 1, maxConcurrent: 2 });
  let releaseConnect;
  const connecting = new Promise((resolve) => { releaseConnect = resolve; });
  let enteredConnect;
  const entered = new Promise((resolve) => { enteredConnect = resolve; });
  const first = handleAppReportPost(request('{}', { 'content-length': String(size) }), deps(admission, {
    connectDB: async () => { enteredConnect(); await connecting; },
  }));
  await entered;

  const busy = await handleAppReportPost(request('{}', { 'content-length': String(size) }), deps(admission));
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get('retry-after'), '5');
  assert.deepEqual(await busy.json(), { error: 'Report intake is busy; retry later' });

  releaseConnect();
  assert.equal((await first).status, 200);
  assert.equal((await handleAppReportPost(request('{}', { 'content-length': String(size) }), deps(admission))).status, 200);
});

test('בקשה בלי Content-Length שומרת את מלוא התקציב ומשחררת אותו גם אחרי JSON פגום', async () => {
  const admission = createAppReportAdmission({ maxInflightBytes: 10, minReservationBytes: 1, maxConcurrent: 2 });
  // בתקציב בדיקה קטן, אורך לא ידוע גדול ממנו ולכן אינו מתקבל.
  const unknown = request('{');
  unknown.headers.delete('content-length');
  assert.equal((await handleAppReportPost(unknown, deps(admission))).status, 503);

  const invalid = request('{', { 'content-length': '1' });
  assert.equal((await handleAppReportPost(invalid, deps(admission))).status, 400);
  assert.equal((await handleAppReportPost(request('{}', { 'content-length': '2' }), deps(admission))).status, 200);
});
