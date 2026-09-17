import { after } from 'next/server';
import { handleGithubWebhook } from '@/lib/app-reports/webhook';
import { sendAppReportClosedNotification } from '@/lib/emailService';

export const dynamic = 'force-dynamic';

// ציבורי: האימות הוא חתימת ה-HMAC של GitHub, והמצב נקרא מחדש מ-GitHub (src/lib/app-reports/webhook.js).
export async function POST(request) {
  return handleGithubWebhook(request, {
    sendClosedMail: sendAppReportClosedNotification,
    schedule: (work) => after(work),
  });
}
