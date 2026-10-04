import { handleEventsPost } from '@/lib/search-feedback/handler';

export const dynamic = 'force-dynamic';

// מנת אירועי משוב חתומה מהתוכנה. הלוגיקה ב-src/lib/search-feedback.
export async function POST(request) {
  return handleEventsPost(request);
}
