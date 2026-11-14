import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { mine } from '@/lib/tzuratHadaf/volunteer';
import { json, serverError } from '@/lib/tzuratHadaf/respond';

// GET — "התרומות שלי": נקודות, הכרעות, עמודים שהוגשו ודיווחים, עם הסטטוסים
export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    return json(await mine(g.userId));
  } catch (e) {
    console.error('tzurat mine', e);
    return serverError();
  }
}
