import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { claimPage } from '@/lib/tzuratHadaf/pages';
import { fromResult, serverError } from '@/lib/tzuratHadaf/respond';

// POST — תפיסת עמוד (עד 5, 48 שעות; שבת וחג אינם נספרים) ← {leasedUntil}
export async function POST(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    const { id } = await params;
    return fromResult(await claimPage(id, g.userId));
  } catch (e) {
    console.error('tzurat claim', e);
    return serverError();
  }
}
