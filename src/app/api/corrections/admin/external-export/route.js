import { withCorrections } from '../../_shared';
import { exportExternalPackages } from '@/lib/corrections/volunteer';

export const dynamic = 'force-dynamic';

// ייצוא ידני בלבד (הורדת JSON); אין שליחה אוטומטית לשום יעד.
export async function GET(request) {
  return withCorrections(request, async ({ user }) => {
    const res = await exportExternalPackages({ user });
    if (res.status !== 200) return res;
    const stamp = new Date().toISOString().slice(0, 10);
    return { ...res, headers: { 'content-disposition': `attachment; filename="sefaria-external-${stamp}.json"` } };
  });
}
