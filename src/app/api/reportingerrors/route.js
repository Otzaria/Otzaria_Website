import { after } from 'next/server';
import { handleReportingErrorsPost } from '@/lib/corrections/reporting-handler';

// הלוגיקה (קליטה אטומית, idempotency, מייל כהתראה בלבד) ב-src/lib/corrections/reporting-handler.js.
export async function POST(request) {
  return handleReportingErrorsPost(request, { schedule: (work) => after(work) });
}
