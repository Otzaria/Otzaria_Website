import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { overview } from '@/lib/tzuratHadaf/volunteer';
import { json, serverError } from '@/lib/tzuratHadaf/respond';

// GET — דף הכניסה של המתנדב: המסכתות עם המונים, התרומות שלו והדגלים (CONTRACT "מתנדב")
export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    return json(await overview(g.userId, { canAdmin: g.isAdmin }));
  } catch (e) {
    console.error('tzurat overview', e);
    return serverError();
  }
}
