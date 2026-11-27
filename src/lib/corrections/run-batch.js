/**
 * נקודת ההרצה היחידה של אצוות ה-worker: ה-cron והטריגרים שאחרי בקשה קוראים לה,
 * כך שלא נוצרות שתי אצוות בתהליך אחד. הנכונות בין תהליכים נשמרת ב-lease+fence שב-DB.
 */
import connectDB from '../db.js';
import { shabbatGate } from '../shabbat-cache.js';
import WorkerHeartbeat from '../../models/WorkerHeartbeat.js';
import { runWorkerBatch } from './worker.js';
import { loadCorrectionsConfig, defaultWorkerId } from './runtime.js';

// בקשת אצווה בזמן שאצווה רצה אינה הולכת לאיבוד: היא מסמנת "להריץ שוב", והאצווה הרצה חוזרת פעם
// נוספת כשהיא מסתיימת (למשל אישור לפרסום שהגיע באמצע). התקרה מונעת שרשרת אינסופית.
export const MAX_CHAINED_BATCHES = 3;

/**
 * מריץ את runOne אחת-אחת בתהליך. קריאה בזמן ריצה מחזירה {skipped:'busy'} ומבקשת ריצה חוזרת.
 * @template T
 * @param {(...args:any[]) => Promise<T>} runOne
 */
export function createSerialRunner(runOne, { maxChained = MAX_CHAINED_BATCHES } = {}) {
  let running = false;
  let rerunRequested = false;
  return async (...args) => {
    if (running) {
      rerunRequested = true;
      return { skipped: 'busy' };
    }
    running = true;
    try {
      let result;
      for (let n = 0; n < maxChained; n++) {
        rerunRequested = false;
        result = await runOne(...args);
        if (!rerunRequested || result?.paused) break;
      }
      return result;
    } finally {
      running = false;
    }
  };
}

async function runOneBatch({ workerId: requestedId } = {}) {
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
}

/**
 * @returns {Promise<{skipped?:'busy', paused?:'shabbat', stats?:object}>}
 */
export const runBatchOnce = createSerialRunner(runOneBatch);

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
