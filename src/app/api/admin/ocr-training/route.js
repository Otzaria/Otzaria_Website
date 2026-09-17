import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import OcrTrainingPage from '@/models/OcrTrainingPage';
import Book from '@/models/Book';
import Page from '@/models/Page';
import sharp from 'sharp';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasOcrAccess } from '@/lib/roles';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { LINES_PER_PAGE } from '@/lib/ocr/trainingValidation';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';

// GET: רשימת כל עמודי האימון עם התקדמות סימון השורות.
export async function GET() {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;

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
    return serverError();
  }
}

// POST: הוספת עמוד למאגר האימון לפי ספר + מספר עמוד.
// גוף: { bookId, pageNumber, scriptType? }  — יעד השורות קבוע (10) לכל העמודים.
export async function POST(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;

  try {
    const { bookId, pageNumber, scriptType } = await request.json();
    if (!bookId || !Number.isInteger(Number(pageNumber))) {
      return badRequest('חסר מזהה ספר או מספר עמוד');
    }
    const pageNum = Number(pageNumber);
    const script = scriptType === 'rashi' ? 'rashi' : 'square';

    await connectDB();

    const book = await Book.findById(bookId);
    if (!book) {
      return notFound('הספר לא נמצא');
    }

    const page = await Page.findOne({ book: book._id, pageNumber: pageNum });
    if (!page) {
      return notFound(`עמוד ${pageNum} לא קיים בספר זה`);
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

    revalidateNow(CACHE_TAGS.OCR_TRAINING_LIST);
    return NextResponse.json({ success: true, id: String(doc._id) });
  } catch (error) {
    console.error('OCR training add error:', error);
    return serverError();
  }
}
