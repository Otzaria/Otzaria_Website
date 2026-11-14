import { handleTriageQueueGet } from '@/lib/app-reports/triage-handler';

export const dynamic = 'force-dynamic';

// צרכן חיצוני: שירות הבדיקה האוטומטית (docs/app-reports/TRIAGE.md).
export async function GET(request) {
  return handleTriageQueueGet(request);
}
