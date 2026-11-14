import mongoose from 'mongoose';
import sharp from 'sharp';
import { readPageImage } from '@/lib/ocr/images';
import { pageImagePath } from '../../../_lib/framesDb';
import { gate, json, serverError } from '../../../_lib/http';

// GET /api/training-proof/frames/pages/<id>/image[?thumb=1] — תמונת-העמוד בגודלה המלא (הקואורדינטות של המסגרות
// בפיקסלים שלה, וההצמדה לדיו קוראת את הפיקסלים שלה), או ממוזערת לרשימת-העמודים. רק למי שמחזיק את הספר,
// ולמנהל. התמונות לא מוגשות כנכס סטטי (docs/76 §8: אחרי ההורדה לתחנה הן נמחקות).
const THUMB_W = 180;

export async function GET(request, { params }) {
  const { gate: g, res } = await gate();
  if (res) return res;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return json({ success: false, error: 'מזהה עמוד לא תקין' }, 400);
    const r = await pageImagePath(g.userId, id, { isAdmin: g.isAdmin });
    if (!r.ok) return json({ success: false, error: r.error }, r.status);
    const { buffer, mimeType } = await readPageImage(r.imagePath);
    const thumb = new URL(request.url).searchParams.get('thumb') === '1';
    const body = thumb ? await sharp(buffer).resize({ width: THUMB_W, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer() : buffer;
    return new Response(body, {
      headers: {
        'Content-Type': thumb ? 'image/jpeg' : mimeType,
        // התמונה של פריט לא משתנה (פריט חדש = מזהה חדש)
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (e) {
    if (e?.code === 'ENOENT') return json({ success: false, error: 'התמונה חסרה בשרת' }, 404);
    return serverError('image GET', e);
  }
}
