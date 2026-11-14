import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { bookPages } from '@/lib/tzuratHadaf/pages';
import { fromResult, badRequest, serverError } from '@/lib/tzuratHadaf/respond';
import { SLUG_RE } from '@/lib/tzuratHadaf/common';

// GET ?slug= — כמו books/[slug]/pages (שתי הכתובות מופיעות ב-CONTRACT)
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    const slug = new URL(request.url).searchParams.get('slug') || '';
    if (!SLUG_RE.test(slug)) return badRequest('מסכת לא תקינה');
    return fromResult(await bookPages(slug, g.userId));
  } catch (e) {
    console.error('tzurat pages', e);
    return serverError();
  }
}
