/**
 * הרצת אצוות אחת-אחת בתהליך (createSerialRunner): בקשה שמגיעה בזמן ריצה אינה הולכת לאיבוד.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSerialRunner, MAX_CHAINED_BATCHES } from './run-batch.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

test('קריאה בזמן ריצה → busy, והריצה הנוכחית חוזרת פעם נוספת כשהיא מסתיימת', async () => {
  const gates = [deferred(), deferred()];
  let calls = 0;
  const run = createSerialRunner(async () => {
    const n = calls++;
    await gates[n]?.promise;
    return { stats: n };
  });
  const first = run();
  assert.deepEqual(await run(), { skipped: 'busy' });
  assert.deepEqual(await run(), { skipped: 'busy' }, 'כמה בקשות באמצע = ריצה חוזרת אחת');
  gates[0].resolve();
  await Promise.resolve();
  gates[1].resolve();
  assert.deepEqual(await first, { stats: 1 });
  assert.equal(calls, 2);
  // בלי בקשה באמצע — ריצה אחת
  calls = 0;
  gates.length = 0;
  assert.deepEqual(await run(), { stats: 0 });
  assert.equal(calls, 1);
});

test('שרשרת הריצות החוזרות מוגבלת, ושבת עוצרת אותה; חריגה משחררת את המנעול', async () => {
  let calls = 0;
  let again = null;
  const run = createSerialRunner(async () => {
    calls += 1;
    if (again) await again(); // בקשה חדשה בכל ריצה
    return { stats: calls };
  });
  again = () => run();
  assert.deepEqual(await run(), { stats: MAX_CHAINED_BATCHES });
  const paused = createSerialRunner(async () => { await paused(); return { paused: 'shabbat' }; });
  assert.deepEqual(await paused(), { paused: 'shabbat' });
  const boom = createSerialRunner(async () => { throw new Error('boom'); });
  await assert.rejects(boom());
  await assert.rejects(boom(), 'המנעול שוחרר — הריצה הבאה מתחילה');
});
