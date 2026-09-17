import { NextResponse } from 'next/server';
import { authorizeCron, defaultWorkerId } from '@/lib/corrections/runtime';
import { runBatchOnce } from '@/lib/corrections/run-batch';

export const dynamic = 'force-dynamic';

// רשת ביטחון בלבד: ניסיונות חוזרים, lease שפג והמתנה לשירות הבדיקה. עבודה חדשה
// מריצה אצווה מיד בסיום הבקשה שיצרה אותה (run-batch.js).
async function run(request) {
  const auth = authorizeCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const workerId = request.headers.get('x-worker-id')?.slice(0, 100) || defaultWorkerId();
    const result = await runBatchOnce({ workerId });
    if (result.skipped) return NextResponse.json({ ok: true, skipped: result.skipped }, { status: 202 });
    if (result.paused) return NextResponse.json({ ok: true, paused: result.paused });
    const stats = result.stats;
    return NextResponse.json({
      ok: !stats.error, drained: stats.drained, dispatched: stats.dispatched,
      verify: stats.verify.length, publish: stats.publish.length, prTracked: stats.prTracked, error: stats.error,
    });
  } catch (err) {
    console.error('[corrections-worker] batch failed:', err?.message);
    return NextResponse.json({ ok: false, error: 'batch_failed' }, { status: 500 });
  }
}

export async function POST(request) { return run(request); }
export async function GET(request) { return run(request); }
