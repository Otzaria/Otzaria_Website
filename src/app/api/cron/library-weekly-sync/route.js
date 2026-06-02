import { NextResponse } from 'next/server';
import { pullLibraryBooks, pushLibraryToGitHub } from '@/lib/dicta/library-sync';
import { reconcileApprovedEdits } from '@/lib/dicta/moderation-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorize(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET not configured' };
  const header = request.headers.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!provided || provided !== secret) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

/**
 * סנכרון שבועי (מתוכנן ליום שישי בבוקר):
 *  1. משיכה — אימוץ עריכות upstream שאין להן התנגשות + ספרים חדשים.
 *  2. דחיפה — מיזוג 3-way ודחיפת התיקונים לגיטהאב. קונפליקטים מסומנים לפתרון.
 */
async function run(request) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const now = new Date();
  try {
    // שחזור הצעות שנתקעו (approved אך לא applied) לפני המיזוג, כדי שתוכנן ייכלל
    const reconcile = await reconcileApprovedEdits();
    const pull = await pullLibraryBooks({ onlyNew: false });
    let push = null;
    try {
      push = await pushLibraryToGitHub({ force: false });
    } catch (e) {
      // אם אין טוקן — המשיכה כבר רצה; נדווח בלי להפיל
      push = { error: e.message, code: e.code || null };
    }
    return NextResponse.json({ success: true, ranAt: now.toISOString(), reconcile, pull, push });
  } catch (error) {
    console.error('Library weekly sync error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) { return run(request); }
export async function GET(request) { return run(request); }
