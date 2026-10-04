import { requireSearchFeedbackAccess, jsonNoStore } from '@/lib/search-feedback/route-auth';
import { buildExportFilter, exportEventsStream } from '@/lib/search-feedback/service';
import { invalidFilterResponse } from '@/lib/search-feedback/purge-route';

export const dynamic = 'force-dynamic';

// GET /api/search-feedback/admin/export?from=&to=&type=&modelFamilyId=&modelQuantization=|noQuantization=1&keyId=&includeBlocked=1
// NDJSON בזרימה לצנרת האימון; from/to חלים על זמן הקליטה בשרת.
export async function GET(request) {
  const auth = await requireSearchFeedbackAccess();
  if (!auth.ok) return auth.response;
  const parsed = buildExportFilter(new URL(request.url).searchParams);
  if (!parsed.ok) return invalidFilterResponse(parsed.field);
  try {
    const stream = await exportEventsStream(parsed);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return new Response(stream, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'content-disposition': `attachment; filename="search-feedback-${stamp}.ndjson"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Search feedback export failed:', error?.message);
    return jsonNoStore({ error: 'הייצוא נכשל' }, 500);
  }
}
