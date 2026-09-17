import { handleAppReportPost } from '@/lib/app-reports/handler';
import { saveFileToGridFS } from '@/lib/gridfs-service';

export const dynamic = 'force-dynamic';

// דיווח על התוכנה מתוך אוצריא. הלוגיקה ב-src/lib/app-reports.
export async function POST(request) {
  return handleAppReportPost(request, { saveFile: saveFileToGridFS });
}
