#!/usr/bin/env node
/**
 * לולאת ה-worker של תיקוני הטקסט: קוראת ל-/api/cron/corrections-worker כל X שניות.
 * הרצה: node scripts/corrections-worker.mjs [--once]   (תחת pm2 או cron — ראו OPERATIONS.md)
 * env: CRON_SECRET (חובה), CORRECTIONS_WORKER_URL (ברירת מחדל http://127.0.0.1:3000), CORRECTIONS_WORKER_ID.
 */
try { (await import('dotenv')).config(); } catch { /* dotenv אופציונלי */ }

const base = (process.env.CORRECTIONS_WORKER_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const secret = process.env.CRON_SECRET;
const INTERVAL_SECONDS = 30;
const interval = INTERVAL_SECONDS * 1000;
const once = process.argv.includes('--once');
const workerId = process.env.CORRECTIONS_WORKER_ID || `loop:${process.pid}`;

if (!secret) {
  console.error('[corrections-worker] CRON_SECRET חסר — יציאה');
  process.exit(2);
}

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; });

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/cron/corrections-worker`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'x-worker-id': workerId },
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const body = await res.json().catch(() => ({}));
    const line = `[corrections-worker] ${new Date().toISOString()} ${res.status} ${JSON.stringify(body)} (${Date.now() - started}ms)`;
    if (res.ok) console.log(line); else console.error(line);
    return res.ok;
  } catch (err) {
    console.error(`[corrections-worker] ${new Date().toISOString()} request failed: ${err?.message}`);
    return false;
  }
}

if (once) {
  process.exit((await tick()) ? 0 : 1);
}
while (!stopping) {
  await tick();
  const until = Date.now() + interval;
  while (!stopping && Date.now() < until) await new Promise((r) => setTimeout(r, 500));
}
console.log('[corrections-worker] stopped');
