import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { shabbatGate } from '@/lib/shabbat-cache';
import { runWorkerBatch } from '@/lib/corrections/worker';
import { loadCorrectionsConfig, authorizeCron, defaultWorkerId } from '@/lib/corrections/runtime';
import WorkerHeartbeat from '@/models/WorkerHeartbeat';

export const dynamic = 'force-dynamic';

// מונע ערימת אצוות באותו תהליך; הנכונות בין תהליכים נשמרת ע"י lease+fence ב-DB.
let running = false;

async function run(request) {
  const auth = authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (running) return NextResponse.json({ ok: true, skipped: 'busy' }, { status: 202 });
  running = true;
  try {
    await connectDB();
    const workerId = request.headers.get('x-worker-id')?.slice(0, 100) || defaultWorkerId();
    if (process.env.CORRECTIONS_WORKER_PAUSE_ON_SHABBAT !== '0' && await shabbatGate.isAssurBemlacha()) {
      await WorkerHeartbeat.updateOne({ workerId }, { $set: { lastBeatAt: new Date(), lastBatch: { paused: 'shabbat' }, lastError: null } }, { upsert: true });
      return NextResponse.json({ ok: true, paused: 'shabbat' });
    }
    const config = await loadCorrectionsConfig();
    const stats = await runWorkerBatch({ config, workerId });
    return NextResponse.json({
      ok: !stats.error, drained: stats.drained, dispatched: stats.dispatched,
      verify: stats.verify.length, publish: stats.publish.length, prTracked: stats.prTracked, error: stats.error,
    });
  } catch (err) {
    console.error('[corrections-worker] batch failed:', err?.message);
    return NextResponse.json({ ok: false, error: 'batch_failed' }, { status: 500 });
  } finally {
    running = false;
  }
}

export async function POST(request) { return run(request); }
export async function GET(request) { return run(request); }
