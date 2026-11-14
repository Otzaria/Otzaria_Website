import connectDB from '@/lib/db';
import TzuratItem from '@/models/TzuratItem';
import { requireTzuratSession } from '@/lib/tzuratHadaf/session';
import { pageOfItem } from '@/lib/tzuratHadaf/items';
import { itemCrop, originalImage } from '@/lib/tzuratHadaf/imageServe';
import { imageResponse, notFound, serverError } from '@/lib/tzuratHadaf/respond';
import { isObjectId } from '@/lib/tzuratHadaf/common';

// GET [?ctx=1][?full=1] — חיתוך הסריקה סביב תיבת הפריט (WebP), הקשר רחב (ctx), או הסריקה המלאה (full).
// private, max-age=86400, immutable — הכתובת כוללת גרסה (v) לפי הבנייה של העמוד.
export async function GET(request, { params }) {
  const g = await requireTzuratSession();
  if (g.error) return g.error;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return notFound('התמונה לא נמצאה');
    await connectDB();
    const item = await TzuratItem.findById(id, { box: 1, page: 1, slug: 1, dafKey: 1 }).lean();
    if (!item) return notFound('התמונה לא נמצאה');
    const page = await pageOfItem(item);
    const sp = new URL(request.url).searchParams;
    const img = sp.get('full') === '1' ? await originalImage(page?.scan?.path) : await itemCrop(item, page, { ctx: sp.get('ctx') === '1' });
    if (!img) return notFound('התמונה לא נמצאה');
    return imageResponse(img);
  } catch (e) {
    console.error('tzurat item image', e);
    return serverError();
  }
}
