/**
 * נקודת ההרצה היחידה של אצוות ה-worker: ה-cron והטריגרים שאחרי בקשה קוראים לה,
 * כך שלא נוצרות שתי אצוות בתהליך אחד. הנכונות בין תהליכים נשמרת ב-lease+fence שב-DB.
 */
import connectDB from '../db.js';
import { shabbatGate } from '../shabbat-cache.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import { runWorkerBatch } from './worker.js';
import { loadCorrectionsConfig, defaultWorkerId } from './runtime.js';

let running = false;

/**
 * @returns {Promise<{skipped?:'busy', paused?:'shabbat', stats?:object}>}
 */
export async function runBatchOnce({ workerId: requestedId } = {}) {
  if (running) return { skipped: 'busy' };
  running = true;
  try {
    await connectDB();
    const workerId = requestedId || defaultWorkerId();
    if (await shabbatGate.isAssurBemlacha()) {
      await WorkerHeartbeat.updateOne(
        { workerId },
        { $set: { lastBeatAt: new Date(), lastBatch: { paused: 'shabbat' }, lastError: null } },
        { upsert: true },
      );
      return { paused: 'shabbat' };
    }
    const config = await loadCorrectionsConfig();
    return { stats: await runWorkerBatch({ config, workerId }) };
  } finally {
    running = false;
  }
}

/**
 * מריץ אצווה אחרי התשובה למשתמש. best-effort: כשל נרשם בלוג ולעולם אינו מכשיל את הבקשה.
 * @param {(work:() => Promise<void>) => void} [schedule] ב-route: `after` מ-next/server
 */
export function triggerWorkerBatch(schedule, reason = 'trigger') {
  if (typeof schedule !== 'function') return;
  const fail = (err) => console.error(`[corrections-worker] ${reason}:`, err?.message);
  try {
    schedule(async () => {
      try {
        await runBatchOnce();
      } catch (err) {
        fail(err);
      }
    });
  } catch (err) {
    fail(err);
  }
}
