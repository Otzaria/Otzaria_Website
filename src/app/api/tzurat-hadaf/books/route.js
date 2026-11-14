import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { listBooks } from '@/lib/tzuratHadaf/pages';
import { json, serverError } from '@/lib/tzuratHadaf/respond';

// GET — המסכתות עם המונים ← {books} (כמו overview.books)
export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    return json({ books: await listBooks() });
  } catch (e) {
    console.error('tzurat books', e);
    return serverError();
  }
}
