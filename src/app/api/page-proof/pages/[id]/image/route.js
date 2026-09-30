import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PageProofPage from '@/models/PageProofPage';
import { readPageImage } from '@/lib/ocr/images';
import { requireProofSession } from '@/lib/pageProof/pool';
import { badRequest, notFound, serverError } from '@/lib/apiResponse';

// GET: תמונת-העמוד בגודלה המלא — הקואורדינטות בעמוד הן בפיקסלים שלה, והעורך
// מצייר מעליה. מוגשת רק למשתמשים מאומתים (התיקייה חסומה כנכס סטטי).
export async function GET(request, { params }) {
  const { error } = await requireProofSession();
  if (error) return error;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badRequest('מזהה עמוד לא תקין');
    await connectDB();
    const page = await PageProofPage.findById(id, { imagePath: 1 }).lean();
    if (!page) return notFound('העמוד לא נמצא');
    const { buffer, mimeType } = await readPageImage(page.imagePath);
    return new Response(buffer, {
      headers: {
        'Content-Type': mimeType,
        // ייבוא-חוזר כותב לאותו נתיב רק לעמוד שלא נענה, או לעמוד שחזר
        // מזיהוי-מחדש בגרסה חדשה — והגרסה בכתובת (?v=, editorPageShape),
        // כך שהמטמון לא מגיש תמונה של גרסה קודמת
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (e) {
    console.error('page-proof image', e);
    return serverError();
  }
}
