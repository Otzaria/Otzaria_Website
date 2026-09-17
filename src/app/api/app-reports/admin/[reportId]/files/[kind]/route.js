import { requireAppReportsAccess, jsonNoStore } from '@/lib/app-reports/route-auth';
import { loadReportFile } from '@/lib/app-reports/service';
import { getFileFromGridFS } from '@/lib/gridfs-service';

export const dynamic = 'force-dynamic';

// kind: diagnostics | errors
export async function GET(_request, { params }) {
  const auth = await requireAppReportsAccess();
  if (!auth.ok) return auth.response;
  try {
    const { reportId, kind } = await params;
    const file = await loadReportFile(String(reportId), String(kind), getFileFromGridFS);
    if (!file) return jsonNoStore({ error: 'File not found' }, 404);
    return new Response(file.buffer, {
      status: 200,
      headers: {
        'content-type': file.contentType,
        'content-disposition': `attachment; filename="${file.filename}"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('App report file download failed:', error?.message);
    return jsonNoStore({ error: 'Failed to load file' }, 500);
  }
}
