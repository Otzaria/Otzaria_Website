import connectDB from '@/lib/db';
import { unsubscribeByToken } from '@/lib/app-reports/service';
import { getAppReportsConfig } from '@/lib/app-reports/config';

export const dynamic = 'force-dynamic';

function page(message, status) {
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>אוצריא</title></head>
<body style="font-family: Arial, sans-serif; text-align: center; padding: 60px 16px;"><h1 style="font-size: 22px;">${message}</h1></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

async function handle(request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return page('קישור לא תקין', 400);
  try {
    await connectDB();
    const result = await unsubscribeByToken(token, getAppReportsConfig());
    if (!result.ok) return page('הקישור אינו תקין או שהדיווח אינו קיים', result.reason === 'not_found' ? 404 : 403);
    return page('הוסרת מקבלת עדכונים על הדיווחים שלך', 200);
  } catch (error) {
    console.error('App report unsubscribe failed:', error?.message);
    return page('אירעה שגיאה, נסה שוב מאוחר יותר', 500);
  }
}

export async function GET(request) {
  return handle(request);
}

// הסרה בלחיצה אחת מתוכנת הדואר (List-Unsubscribe-Post)
export async function POST(request) {
  return handle(request);
}
