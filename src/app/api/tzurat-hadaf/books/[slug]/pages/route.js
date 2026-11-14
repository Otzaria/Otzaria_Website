import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { bookPages } from '@/lib/tzuratHadaf/pages';
import { fromResult, notFound, serverError } from '@/lib/tzuratHadaf/respond';
import { SLUG_RE } from '@/lib/tzuratHadaf/common';

// GET — רשת העמודים של מסכת ← {book, pages:[{id, daf, dafKey, state, pendingCount, round, nonVilna}], held, maxHeld}
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    const { slug } = await params;
    if (!SLUG_RE.test(String(slug))) return notFound('המסכת לא נמצאה');
    return fromResult(await bookPages(slug, g.userId));
  } catch (e) {
    console.error('tzurat book pages', e);
    return serverError();
  }
}
