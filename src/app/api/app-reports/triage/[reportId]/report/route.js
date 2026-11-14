import { handleTriageMaterialGet } from '@/lib/app-reports/triage-handler';

export const dynamic = 'force-dynamic';

// צרכן חיצוני: שירות הבדיקה האוטומטית (docs/app-reports/TRIAGE.md).
export async function GET(request, { params }) {
  const { reportId } = await params;
  return handleTriageMaterialGet(request, reportId);
}
