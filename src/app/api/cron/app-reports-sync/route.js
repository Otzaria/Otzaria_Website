import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { runAppReportsSync } from '@/lib/app-reports/service';
import { getAppReportsConfig } from '@/lib/app-reports/config';
import { sendAppReportClosedNotification } from '@/lib/emailService';

export const dynamic = 'force-dynamic';

function authorize(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET not configured' };
  const header = request.headers.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!provided || provided !== secret) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

// ניסיון חוזר לדיווחים ממתינים + בדיקת מצב ה-issues ומיילי סגירה
async function run(request) {
  const auth = authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    await connectDB();
    const now = new Date();
    const summary = await runAppReportsSync({ config: getAppReportsConfig(), sendClosedMail: sendAppReportClosedNotification, now });
    return NextResponse.json({ success: true, ranAt: now.toISOString(), ...summary });
  } catch (error) {
    console.error('App reports sync cron error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
