import { requireAppReportsAccess, jsonNoStore } from '@/lib/app-reports/route-auth';
import { listReports } from '@/lib/app-reports/service';
import { getAppReportsConfig } from '@/lib/app-reports/config';

export const dynamic = 'force-dynamic';

// GET /api/app-reports/admin/list?type=&trigger=&issueState=&page=
export async function GET(request) {
  const auth = await requireAppReportsAccess();
  if (!auth.ok) return auth.response;
  try {
    const sp = new URL(request.url).searchParams;
    const result = await listReports({
      type: sp.get('type'), trigger: sp.get('trigger'), issueState: sp.get('issueState'), page: sp.get('page'), limit: sp.get('limit'),
    }, auth.user.role);
    const config = getAppReportsConfig();
    return jsonNoStore({
      success: true,
      ...result,
      github: { repo: config.repo, tokenConfigured: Boolean(config.githubToken) },
    });
  } catch (error) {
    console.error('App reports list failed:', error?.message);
    return jsonNoStore({ error: 'Failed to load reports' }, 500);
  }
}
