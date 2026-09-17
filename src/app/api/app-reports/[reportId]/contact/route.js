import { requireAppReportsAccess, jsonNoStore } from '@/lib/app-reports/route-auth';
import { contactReporter } from '@/lib/app-reports/service';
import { checkSameOrigin } from '@/lib/corrections/http';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendAppReportContactEmail } from '@/lib/emailService';

export const dynamic = 'force-dynamic';

// POST {subject, message} — מייל למדווח. הכתובת עצמה אינה חוזרת ללקוח.
export async function POST(request, { params }) {
  const origin = checkSameOrigin(request);
  if (!origin.ok) return jsonNoStore({ error: 'csrf_rejected' }, 403);
  const auth = await requireAppReportsAccess();
  if (!auth.ok) return auth.response;

  const { reportId } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ error: 'Invalid JSON body' }, 400);
  }
  if (!checkRateLimit(`report:${reportId}`, 'app-report-contact', 3, 'hour')) {
    return jsonNoStore({ error: 'Too many requests' }, 429);
  }
  try {
    const result = await contactReporter(
      { reportId: String(reportId), subject: body?.subject, message: body?.message, user: auth.user },
      { sendContactMail: sendAppReportContactEmail },
    );
    return jsonNoStore(result.body, result.status);
  } catch (error) {
    console.error('App report contact failed:', error?.message);
    return jsonNoStore({ error: 'Failed to contact reporter' }, 500);
  }
}
