import { requireAppReportsAccess, jsonNoStore } from '@/lib/app-reports/route-auth';
import { forcePublishReport } from '@/lib/app-reports/triage-decision';
import { checkSameOrigin } from '@/lib/corrections/http';
import { getAppReportsConfig } from '@/lib/app-reports/config';

export const dynamic = 'force-dynamic';

// POST — "פתח בכל זאת": דיווח שהבדיקה האוטומטית החליטה לא לפתוח, או שעוד ממתין לה.
export async function POST(request, { params }) {
  const origin = checkSameOrigin(request);
  if (!origin.ok) return jsonNoStore({ error: 'csrf_rejected' }, 403);
  const auth = await requireAppReportsAccess();
  if (!auth.ok) return auth.response;
  const { reportId } = await params;
  try {
    const result = await forcePublishReport(String(reportId), { config: getAppReportsConfig() });
    return jsonNoStore(result.body, result.status);
  } catch (error) {
    console.error('App report force publish failed:', error?.message);
    return jsonNoStore({ error: 'Failed to publish report' }, 500);
  }
}
