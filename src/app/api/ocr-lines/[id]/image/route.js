import { NextResponse } from 'next/server';
import sharp from 'sharp';
import connectDB from '@/lib/db';
import OcrLine from '@/models/OcrLine';
import { resolveImageFsPath, readPageImage } from '@/lib/ocr/images';
import { requireVerifiedSession } from '@/lib/ocr/linePool';

// GET: תמונת השורה (חיתוך התיבה מתמונת העמוד), או ?full=1 לעמוד המלא —
// לתצוגת ההקשר סביב השורה. מוגש רק למשתמשים מאומתים; התמונות אינן חשופות
// כנכס סטטי דרך הדף הזה.
export async function GET(request, { params }) {
  const { error } = await requireVerifiedSession();
  if (error) return error;

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const full = searchParams.get('full') === '1';

    await connectDB();
    const doc = await OcrLine.findById(id).lean();
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cacheHeaders = { 'Cache-Control': 'private, max-age=3600' };

    if (full) {
      // העמוד המלא כפי שהוא — ההדגשה מצוירת בצד הלקוח לפי התיבה,
      // ולכן אסור לשנות כאן את מידות התמונה.
      const { buffer, mimeType } = await readPageImage(doc.imagePath);
      return new NextResponse(buffer, {
        headers: { 'Content-Type': mimeType, ...cacheHeaders },
      });
    }

    // מופע sharp יחיד — הקובץ נקרא ומפוענח פעם אחת ל-metadata ולחיתוך
    const fsPath = resolveImageFsPath(doc.imagePath);
    const image = sharp(fsPath);
    const meta = await image.metadata();
    const imgW = meta.width || 0;
    const imgH = meta.height || 0;

    // קיטום התיבה לגבולות התמונה — כמו בייצוא
    const left = Math.max(0, Math.round(doc.x));
    const top = Math.max(0, Math.round(doc.y));
    let width = Math.round(doc.width);
    let height = Math.round(doc.height);
    if (imgW && left + width > imgW) width = imgW - left;
    if (imgH && top + height > imgH) height = imgH - top;
    if (width < 1 || height < 1) {
      return NextResponse.json({ error: 'Invalid crop box' }, { status: 422 });
    }

    const buf = await image.extract({ left, top, width, height }).png().toBuffer();
    return new NextResponse(buf, {
      headers: { 'Content-Type': 'image/png', ...cacheHeaders },
    });
  } catch (err) {
    console.error('OCR line image error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
