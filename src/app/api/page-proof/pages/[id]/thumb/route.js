import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PageProofPage from '@/models/PageProofPage';
import { requireProofSession } from '@/lib/pageProof/pool';
import { pageThumb } from '@/lib/pageProof/thumbs';
import { noStore } from '@/lib/pageProof/respond';
import { badRequest, notFound, serverError } from '@/lib/apiResponse';

// GET: תמונה ממוזערת של העמוד (JPEG ברוחב 360) — לכרטיסי רשת-העמודים ולרשימת
// הספרים. נוצרת מתמונת-העמוד בפעם הראשונה ונשמרת בדיסק (lib/pageProof/thumbs).
// כמו התמונה המלאה: רק למשתמשים מאומתים, ובמטמון הדפדפן בלבד (private).
// הכתובת בדף כוללת ?v=<גרסת-העמוד> — עמוד שחזר מזיהוי-מחדש מקבל כתובת חדשה.
export async function GET(request, { params }) {
  const { error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return noStore(badRequest('מזהה עמוד לא תקין'));
    await connectDB();
    const page = await PageProofPage.findById(id, { imagePath: 1 }).lean();
    if (!page) return noStore(notFound('העמוד לא נמצא'));
    const buffer = await pageThumb(String(page._id), page.imagePath);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (e) {
    console.error('page-proof thumb', e);
    return noStore(serverError());
  }
}
