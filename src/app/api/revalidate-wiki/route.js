import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { WIKI_CACHE_TAG } from '@/lib/wiki';

// Webhook לרענון מיידי של דפי המדריך אחרי עריכת הוויקי.
// הגדרה ב-GitHub: Settings → Webhooks → URL https://otzaria.org/api/revalidate-wiki,
// Content type: application/json, Secret = WIKI_REVALIDATE_SECRET, אירוע: Wiki (gollum).
// האימות: HMAC-SHA256 על גוף הבקשה מול הכותרת X-Hub-Signature-256, בהשוואה קבועת-זמן.
export async function POST(request) {
  const secret = process.env.WIKI_REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'webhook not configured' }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256') || '';
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  // בדיקת אורך על המחרוזת לפני הקצאת Buffer — כותרת ענקית לא תוקצה בזיכרון
  if (signature.length !== expected.length) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  if (event !== 'gollum') {
    // אירועי ping וכדומה — מאומתים אך אינם מרעננים
    return NextResponse.json({ ok: true, ignored: event });
  }

  revalidateTag(WIKI_CACHE_TAG, 'max');
  return NextResponse.json({ ok: true, revalidated: WIKI_CACHE_TAG });
}
