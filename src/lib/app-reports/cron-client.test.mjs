import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runScheduledAppReportsSync } from './cron-client.js';

test('המתזמן קורא לשרת HTTP המקומי עם אימות ומחזיר תוצאת ניקוי', async () => {
  let received;
  const server = createServer((req, res) => {
    received = { method: req.method, path: req.url, auth: req.headers.authorization };
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: true, githubConfigured: true, cleanup: { errors: 0, purged: 2 } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runScheduledAppReportsSync({ env: { CRON_SECRET: 'only-for-test', PORT: String(server.address().port) } });
    assert.deepEqual(received, { method: 'POST', path: '/api/cron/app-reports-sync', auth: 'Bearer only-for-test' });
    assert.equal(result.cleanup.purged, 2);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('תצורה חסרה, HTTP שגוי וכשל חלקי אינם מדווחים כהצלחה', async () => {
  await assert.rejects(runScheduledAppReportsSync({ env: {} }), /CRON_SECRET/);
  await assert.rejects(runScheduledAppReportsSync({ env: { CRON_SECRET: 'test', PORT: 'invalid' } }), /PORT/);
  const env = { CRON_SECRET: 'test' };
  await assert.rejects(runScheduledAppReportsSync({ env, fetchImpl: async () => new Response('', { status: 401 }) }), /401/);
  for (const data of [{ success: true }, { success: true, githubConfigured: false, cleanup: { errors: 0 } }, { success: true, githubConfigured: true, cleanup: { errors: 1 } }]) {
    await assert.rejects(runScheduledAppReportsSync({ env, fetchImpl: async () => Response.json(data) }), /לא הושלם/);
  }
});
