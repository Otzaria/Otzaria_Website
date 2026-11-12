import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfConversionGate } from './pdfConversionGate.js';

test('bounded gate retains FIFO order, rejects excess and transfers permits once', async () => {
  const gate = createPdfConversionGate({ maxActive: 2, maxQueued: 2 });
  const first = await gate.acquire();
  const second = await gate.acquire();
  assert.equal(gate.active, 2);
  const order = [];
  const third = gate.acquire().then(release => { order.push('third'); return release; });
  const fourth = gate.acquire().then(release => { order.push('fourth'); return release; });
  assert.equal(gate.queued, 2);
  await assert.rejects(gate.acquire(), { code: 'PDF_CONVERSION_BUSY' });

  first();
  const releaseThird = await third;
  assert.deepEqual(order, ['third']);
  assert.equal(gate.active, 2);
  assert.equal(gate.queued, 1);
  first(); // idempotent: must not yield a second permit
  assert.equal(gate.active, 2);
  second();
  const releaseFourth = await fourth;
  assert.deepEqual(order, ['third', 'fourth']);
  assert.equal(gate.queued, 0);
  releaseThird();
  releaseFourth();
  assert.equal(gate.active, 0);
  assert.equal(gate.queued, 0);
});

test('aborting a queued acquisition removes its listener and slot', async () => {
  const gate = createPdfConversionGate({ maxActive: 1, maxQueued: 1 });
  const first = await gate.acquire();
  const abort = new AbortController();
  const pending = gate.acquire(abort.signal);
  assert.equal(gate.queued, 1);
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  abort.abort();
  await rejection;
  assert.equal(gate.queued, 0);
  const next = gate.acquire();
  first();
  const release = await next;
  release();
  assert.equal(gate.active, 0);
});

test('pre-aborted signal does not acquire a slot', async () => {
  const gate = createPdfConversionGate();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(gate.acquire(controller.signal), { name: 'AbortError' });
  assert.equal(gate.active, 0);
  assert.equal(gate.queued, 0);
});

test('invalid gate limits fail immediately', () => {
  assert.throws(() => createPdfConversionGate({ maxActive: 0 }), RangeError);
  assert.throws(() => createPdfConversionGate({ maxActive: 1, maxQueued: -1 }), RangeError);
});
