import test from 'node:test';
import assert from 'node:assert/strict';
import { createSemaphore, SemaphoreTimeoutError } from './semaphore.js';

const tick = () => new Promise((r) => setImmediate(r));

test('מגבילה למקביליות 1 ושומרת על סדר FIFO', async () => {
  const sem = createSemaphore(1);
  const order = [];
  let running = 0;
  let maxRunning = 0;
  const job = (name) => sem.run(async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    order.push(`start-${name}`);
    await tick();
    await tick();
    order.push(`end-${name}`);
    running--;
  });
  await Promise.all([job('a'), job('b'), job('c')]);
  assert.equal(maxRunning, 1);
  assert.deepEqual(order, ['start-a', 'end-a', 'start-b', 'end-b', 'start-c', 'end-c']);
  assert.equal(sem.active, 0);
});

test('משחררת כשהפונקציה זורקת', async () => {
  const sem = createSemaphore(1);
  await assert.rejects(sem.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await sem.run(async () => 'ok'), 'ok');
  assert.equal(sem.active, 0);
});

test('timeout בהמתנה: זורקת, מוציאה מהתור ולא חוסמת את הבאים', async () => {
  const sem = createSemaphore(1);
  let release;
  const holder = sem.run(() => new Promise((r) => { release = r; }));
  await assert.rejects(sem.run(async () => 'never', { timeoutMs: 10 }), SemaphoreTimeoutError);
  assert.equal(sem.waiting, 0);
  const next = sem.run(async () => 'next');
  release();
  await holder;
  assert.equal(await next, 'next');
  assert.equal(sem.active, 0);
});

test('max=2 מאפשרת שני במקביל', async () => {
  const sem = createSemaphore(2);
  let running = 0;
  let maxRunning = 0;
  await Promise.all([1, 2, 3, 4].map(() => sem.run(async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await tick();
    running--;
  })));
  assert.equal(maxRunning, 2);
});

test('גודל לא תקין נדחה', () => {
  assert.throws(() => createSemaphore(0));
});
