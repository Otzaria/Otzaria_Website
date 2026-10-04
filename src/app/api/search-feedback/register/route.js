import { handleRegisterPost } from '@/lib/search-feedback/handler';

export const dynamic = 'force-dynamic';

// רישום מפתח אנונימי של התקנה לערוץ משוב החיפוש. הלוגיקה ב-src/lib/search-feedback.
export async function POST(request) {
  return handleRegisterPost(request);
}
