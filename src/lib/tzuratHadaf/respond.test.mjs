import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJsonBody } from './requestBody.js';

function requestOf(chunks, headers = {}) {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (!chunks.length) return controller.close();
      controller.enqueue(chunks.shift());
    },
    cancel() { cancelled = true; },
  });
  return { request: new Request('http://local.test', { method: 'POST', body: stream, headers, duplex: 'half' }), cancelled: () => cancelled };
}

test('readJsonBody limits streamed bodies by bytes and cancels before reading the rest', async () => {
  const { request, cancelled } = requestOf([Buffer.from('12345678'), Buffer.from('90123456'), Buffer.alloc(1024)]);
  assert.deepEqual(await readJsonBody(request, 10), { tooBig: true });
  assert.equal(cancelled(), true);
});

test('readJsonBody parses split UTF-8 JSON and rejects invalid UTF-8', async () => {
  const raw = Buffer.from(JSON.stringify({ text: 'שלום' }));
  const good = requestOf([raw.subarray(0, 9), raw.subarray(9)]).request;
  assert.deepEqual(await readJsonBody(good, 100), { body: { text: 'שלום' } });
  const bad = requestOf([Buffer.from([0xff, 0xfe])]).request;
  assert.deepEqual(await readJsonBody(bad, 100), { body: null });
});

test('readJsonBody rejects an oversized Content-Length before reading', async () => {
  const { request } = requestOf([Buffer.from('{}')], { 'content-length': '101' });
  assert.deepEqual(await readJsonBody(request, 100), { tooBig: true });
});
