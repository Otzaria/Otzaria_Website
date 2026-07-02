import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import mongoose from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';

// בניית ה-PDF מתבצעת כולה בזיכרון (pdf-lib אינו תומך בהזרמה), ולכן מאריכים את חלון הזמן
// ומגבילים את הנפח הכולל כדי להחזיר שגיאה ברורה במקום להפיל את התהליך על ספרים ענקיים.
export const maxDuration = 300;

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads'));

// תקרת נפח כולל של תמונות העמודים (ברירת מחדל 200MB, ניתן לכוונון דרך משתנה סביבה)
const MAX_TOTAL_IMAGE_BYTES = Number(process.env.PDF_EXPORT_MAX_BYTES) || 200 * 1024 * 1024;

// ממיר נתיב תמונה יחסי (למשל /uploads/books/slug/page.1.jpg) לנתיב פיזי במערכת הקבצים
function resolveImagePath(imagePath) {
  if (!imagePath) return null;
  const relative = imagePath.replace(/^\/?uploads\//, '');
  const resolved = path.resolve(UPLOAD_ROOT, relative);

  // אימות בטיחות נתיב (Path Traversal Protection) — אסור לצאת מתיקיית ההעלאות
  if (resolved !== UPLOAD_ROOT && !resolved.startsWith(UPLOAD_ROOT + path.sep)) {
    console.error('Security alert: image path outside upload root:', resolved);
    return null;
  }
  return resolved;
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasBookLibraryAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');

    if (!bookId) {
      return NextResponse.json({ success: false, error: 'חסר מזהה ספר (bookId)' }, { status: 400 });
    }

    if (!mongoose.isValidObjectId(bookId)) {
      return NextResponse.json({ success: false, error: 'מזהה ספר לא תקין' }, { status: 400 });
    }

    const book = await Book.findById(bookId).select('name slug').lean();
    if (!book) {
      return NextResponse.json({ success: false, error: 'הספר לא נמצא' }, { status: 404 });
    }

    // חלק מהעמודים (למשל לאחר מיזוג ספרים) נשמרים תחת השדה bookId ולא book — נשלוף לפי שניהם
    const pages = await Page.find({ $or: [{ book: bookId }, { bookId: bookId }] })
      .sort({ pageNumber: 1 })
      .select('imagePath pageNumber')
      .lean();

    if (!pages || pages.length === 0) {
      return NextResponse.json({ success: false, error: 'לא נמצאו עמודים לספר זה' }, { status: 404 });
    }

    // מעבר מקדים זול (stat בלבד, ללא קריאת תוכן) לאיסוף הקבצים התקפים וסיכום הנפח הכולל
    const validFiles = [];
    let totalBytes = 0;
    for (const page of pages) {
      const filePath = resolveImagePath(page.imagePath);
      if (!filePath) continue;
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        console.warn(`Missing image for page ${page.pageNumber}: ${page.imagePath}`);
        continue;
      }
      totalBytes += stat.size;
      validFiles.push({ filePath, pageNumber: page.pageNumber });
    }

    if (validFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'לא נמצאו תמונות עמודים זמינות לבניית הקובץ' },
        { status: 404 }
      );
    }

    if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
      const mb = Math.round(MAX_TOTAL_IMAGE_BYTES / (1024 * 1024));
      return NextResponse.json(
        { success: false, error: `הספר גדול מדי לייצוא PDF (מעל ${mb}MB של תמונות). פנה למנהל המערכת.` },
        { status: 413 }
      );
    }

    const pdfDoc = await PDFDocument.create();
    let embeddedCount = 0;

    for (const { filePath, pageNumber } of validFiles) {
      // עיבוד כל עמוד בנפרד כדי שכשל בקובץ בודד (חסר/לא קריא/פגום) לא יפיל את ייצוא כל הספר
      try {
        const imageBytes = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();

        const image = (ext === '.png')
          ? await pdfDoc.embedPng(imageBytes)
          : await pdfDoc.embedJpg(imageBytes);

        const pdfPage = pdfDoc.addPage([image.width, image.height]);
        pdfPage.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        embeddedCount++;
      } catch (err) {
        console.warn(`Failed to process page ${pageNumber}: ${err?.message || String(err)}`);
      }
    }

    if (embeddedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'לא נמצאו תמונות עמודים זמינות לבניית הקובץ' },
        { status: 404 }
      );
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `${book.name || book.slug || 'book'}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(pdfBytes.length),
      },
    });

  } catch (error) {
    console.error('Error exporting book PDF:', error);
    return NextResponse.json(
      { success: false, error: 'שגיאת שרת פנימית: ' + (error?.message || String(error)) },
      { status: 500 }
    );
  }
}
