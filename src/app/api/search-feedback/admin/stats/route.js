import { requireSearchFeedbackAccess, jsonNoStore } from '@/lib/search-feedback/route-auth';
import { getStats } from '@/lib/search-feedback/service';
import { getSearchFeedbackConfig } from '@/lib/search-feedback/config';

export const dynamic = 'force-dynamic';

// GET /api/search-feedback/admin/stats?fresh=1 (בלי fresh — מטמון של עד דקה)
export async function GET(request) {
  const auth = await requireSearchFeedbackAccess();
  if (!auth.ok) return auth.response;
  try {
    const fresh = new URL(request.url).searchParams.get('fresh') === '1';
    const stats = await getStats({ fresh });
    return jsonNoStore({ success: true, enabled: getSearchFeedbackConfig().enabled, ...stats });
  } catch (error) {
    console.error('Search feedback stats failed:', error?.message);
    return jsonNoStore({ error: 'טעינת הנתונים נכשלה' }, 500);
  }
}
