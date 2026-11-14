import { handleTriageFileGet } from '@/lib/app-reports/triage-handler';
import { getFileFromGridFS } from '@/lib/gridfs-service';

export const dynamic = 'force-dynamic';

// צרכן חיצוני: שירות הבדיקה האוטומטית (docs/app-reports/TRIAGE.md). kind: errors | diagnostics | image-<n>
export async function GET(request, { params }) {
  const { reportId, kind } = await params;
  return handleTriageFileGet(request, reportId, kind, { readFile: getFileFromGridFS });
}
