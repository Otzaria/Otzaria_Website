import { handleTriageStatusGet, handleTriageDecisionPost } from '@/lib/app-reports/triage-handler';
import { sendAppReportContactEmail } from '@/lib/emailService';

export const dynamic = 'force-dynamic';

// צרכן חיצוני: שירות הבדיקה האוטומטית (docs/app-reports/TRIAGE.md).
export async function GET(request, { params }) {
  const { reportId } = await params;
  return handleTriageStatusGet(request, reportId);
}

export async function POST(request, { params }) {
  const { reportId } = await params;
  return handleTriageDecisionPost(request, reportId, { sendContactMail: sendAppReportContactEmail });
}
