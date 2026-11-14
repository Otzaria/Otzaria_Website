import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { pageDetail } from '@/lib/tzuratHadaf/pages';
import { fromResult, serverError } from '@/lib/tzuratHadaf/respond';
import { itemsPaused } from '@/lib/tzuratHadaf/pause';

// GET — העמוד לבדיקה: {page, items:[FastItem], draft, prev, next}. פתיחה בידי המחזיק מחדשת את התפיסה.
// כשהשאלות מושהות (pause.js) — העמוד בלי השאלות.
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    const { id } = await params;
    const r = await pageDetail(id, g.userId);
    return fromResult(r.ok && itemsPaused() ? { ...r, items: [] } : r);
  } catch (e) {
    console.error('tzurat page', e);
    return serverError();
  }
}
