import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import Book from '@/models/Book';
import Page from '@/models/Page';
import sharp from 'sharp';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { LINES_PER_PAGE } from '@/lib/ocr/trainingValidation';

// GET: רשימת כל עמודי האימון עם התקדמות סימון השורות.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasBooksAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();
    const docs = await OcrTrainingPage.find({})
      .sort({ createdAt: -1 })
      .lean();

    const pages = docs.map((d) => {
      const filled = (d.lines || []).filter((l) => l.text && l.text.trim()).length;
      return {
        id: String(d._id),
        bookName: d.bookName,
        bookSlug: d.bookSlug,
        pageNumber: d.pageNumber,
        imagePath: d.imagePath,
        status: d.status,
        scriptType: d.scriptType || 'square',
        targetLines: d.targetLines || LINES_PER_PAGE,
        markedLines: (d.lines || []).length,
        filledLines: filled,
        claimedByName: d.claimedByName || null,
        updatedAt: d.updatedAt,
        createdAt: d.createdAt,
      };
    });

    return NextResponse.json({ success: true, pages });
  } catch (error) {
    console.error('OCR training list error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST: הוספת עמוד למאגר האימון לפי ספר + מספר עמוד.
// גוף: { bookId, pageNumber, scriptType? }  — יעד השורות קבוע (10) לכל העמודים.
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasBooksAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { bookId, pageNumber, scriptType } = await request.json();
    if (!bookId || !Number.isInteger(Number(pageNumber))) {
      return NextResponse.json({ success: false, error: 'חסר מזהה ספר או מספר עמוד' }, { status: 400 });
    }
    const pageNum = Number(pageNumber);
    const script = scriptType === 'rashi' ? 'rashi' : 'square';

    await connectDB();

    const book = await Book.findById(bookId);
    if (!book) {
      return NextResponse.json({ success: false, error: 'הספר לא נמצא' }, { status: 404 });
    }

    const page = await Page.findOne({ book: book._id, pageNumber: pageNum });
    if (!page) {
      return NextResponse.json(
        { success: false, error: `עמוד ${pageNum} לא קיים בספר זה` },
        { status: 404 }
      );
    }

    const exists = await OcrTrainingPage.findOne({ book: book._id, pageNumber: pageNum });
    if (exists) {
      return NextResponse.json(
        { success: false, error: 'העמוד כבר קיים במאגר האימון' },
        { status: 409 }
      );
    }

    // מדידת מידות התמונה המקורית (לצורך תיאום קואורדינטות וחיתוך בייצוא)
    let imageWidth = 0;
    let imageHeight = 0;
    try {
      const fsPath = resolveImageFsPath(page.imagePath);
      const meta = await sharp(fsPath).metadata();
      imageWidth = meta.width || 0;
      imageHeight = meta.height || 0;
    } catch (e) {
      console.warn('Could not measure image dims:', e.message);
    }

    const doc = await OcrTrainingPage.create({
      book: book._id,
      bookName: book.name,
      bookSlug: book.slug,
      pageNumber: pageNum,
      imagePath: page.imagePath,
      imageWidth,
      imageHeight,
      scriptType: script,
      targetLines: LINES_PER_PAGE,
      status: 'available',
      addedBy: session.user.id || session.user._id,
    });

    return NextResponse.json({ success: true, id: String(doc._id) });
  } catch (error) {
    console.error('OCR training add error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
