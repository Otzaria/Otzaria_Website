import connectDB from '@/lib/db';
import TzuratPage from '@/models/TzuratPage';
import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { pageImage } from '@/lib/tzuratHadaf/imageServe';
import { checkRateLimit } from '@/lib/rate-limit';
import { imageResponse, badRequest, errorJson, notFound, serverError } from '@/lib/tzuratHadaf/respond';
import { isObjectId } from '@/lib/tzuratHadaf/common';

// GET ?side=scan|ours[&x=&y=&w=&h=][&thumb=1] — תמונת העמוד: המקורית, חיתוך (שברים 0–1) או ממוזערת.
// private, max-age=86400, immutable (הכתובת כוללת גרסה v).
export async function GET(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return notFound('התמונה לא נמצאה');
    const sp = new URL(request.url).searchParams;
    const side = sp.get('side') || 'scan';
    if (side !== 'scan' && side !== 'ours') return badRequest('side לא תקין');
    await connectDB();
    // חיתוך/ממוזערת דורשים עיבוד (גם אם רובם במטמון בדיסק) — מוגבלים למשתמש
    const heavy = sp.get('thumb') === '1' || ['x', 'y', 'w', 'h'].some((k) => sp.get(k));
    if (heavy && !checkRateLimit(`user:${g.userId}`, 'tzurat-page-crop', 240, 'minute')) return errorJson(429, 'יותר מדי בקשות תמונה — נסו שוב בעוד דקה');
    const page = await TzuratPage.findById(id, { scan: 1, ours: 1, buildId: 1, round: 1 }).lean();
    if (!page) return notFound('התמונה לא נמצאה');
    const img = await pageImage(page, side, sp);
    if (!img) return notFound('התמונה לא נמצאה');
    if (img.error) return badRequest(img.error);
    return imageResponse(img);
  } catch (e) {
    console.error('tzurat page image', e);
    return serverError();
  }
}
