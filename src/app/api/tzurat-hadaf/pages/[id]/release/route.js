import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { releasePage } from '@/lib/tzuratHadaf/pages';
import { json, fromResult, serverError } from '@/lib/tzuratHadaf/respond';

// POST — שחרור עמוד שבטיפולי ← {ok:true}
export async function POST(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    const { id } = await params;
    const r = await releasePage(id, g.userId);
    return r.ok ? json({ ok: true }) : fromResult(r);
  } catch (e) {
    console.error('tzurat release', e);
    return serverError();
  }
}
