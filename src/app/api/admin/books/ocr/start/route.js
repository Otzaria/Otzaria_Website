import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import OcrJob from '@/models/OcrJob';
import { hasBookLibraryAccess } from '@/lib/roles';
import { runOcrJob } from '@/lib/ocr/runOcrJob';
import { reapStaleOcrJobs } from '@/lib/ocr/staleJobs';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

const ALLOWED_METHODS = ['gemini', 'ocrwin'];
const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-pro-preview'];
const ALLOWED_MODES = ['overwrite', 'skip'];

// השבתה זמנית של OCR לספר שלם דרך Gemini (צד שרת). OCRWin נשאר פעיל.
const GEMINI_ENABLED = false;

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const body = await request.json();
    const { bookId, method, model, existingTextMode, splitColumns } = body || {};

    if (!bookId) {
      return badRequest('חסר מזהה ספר');
    }
    if (!mongoose.isValidObjectId(bookId)) {
      return badRequest('מזהה ספר לא תקין');
    }
    if (!ALLOWED_METHODS.includes(method)) {
      return badRequest('שיטת OCR לא חוקית');
    }
    if (method === 'gemini' && !GEMINI_ENABLED) {
      return NextResponse.json(
        { error: 'OCR באמצעות Gemini מושבת זמנית. אנא השתמש ב-OCRWin.' },
        { status: 503 }
      );
    }
    if (method === 'gemini' && !ALLOWED_MODELS.includes(model)) {
      return badRequest('מודל Gemini לא חוקי');
    }
    if (!ALLOWED_MODES.includes(existingTextMode)) {
      return badRequest('בחירת טיפול בעמודים ערוכים לא חוקית');
    }

    await connectDB();

    const book = await Book.findById(bookId);
    if (!book) {
      return notFound('הספר לא נמצא');
    }

    // שחרור עבודה תקועה (שרת שהופעל מחדש באמצע) לפני הבדיקה, כדי לא לחסום לשווא
    await reapStaleOcrJobs(book._id);

    // מניעת שתי עבודות במקביל על אותו ספר
    const existing = await OcrJob.findOne({ book: book._id, status: 'running' });
    if (existing) {
      return NextResponse.json(
        { error: 'כבר רצה עבודת OCR על הספר הזה', jobId: existing._id.toString() },
        { status: 409 }
      );
    }

    // ספירת עמודים: עם תמונה, וכמה כבר ערוכים
    const editedFilter = {
      book: book._id,
      $or: [{ content: { $gt: '' } }, { rightColumn: { $gt: '' } }, { leftColumn: { $gt: '' } }],
    };
    const [pagesWithImage, editedPagesCount] = await Promise.all([
      Page.countDocuments({ book: book._id, imagePath: { $gt: '' } }),
      Page.countDocuments(editedFilter),
    ]);

    const totalToProcess =
      existingTextMode === 'skip' ? Math.max(0, pagesWithImage - editedPagesCount) : pagesWithImage;

    if (totalToProcess === 0) {
      return badRequest(
        existingTextMode === 'skip'
          ? 'אין עמודים לא-ערוכים לעיבוד (כל העמודים כבר ערוכים)'
          : 'אין עמודים עם תמונה לעיבוד'
      );
    }

    let job;
    try {
      job = await OcrJob.create({
        book: book._id,
        bookName: book.name,
        bookSlug: book.slug,
        method,
        model: method === 'gemini' ? model : '',
        existingTextMode,
        splitColumns: !!splitColumns,
        status: 'running',
        totalPages: totalToProcess,
        editedPagesCount,
        startedBy: session.user?._id || session.user?.id,
        startedByName: session.user?.name || '',
      });
    } catch (e) {
      // האינדקס החלקי החוסם עבודה כפולה (race בין שתי בקשות במקביל)
      if (e?.code === 11000) {
        return NextResponse.json({ error: 'כבר רצה עבודת OCR על הספר הזה' }, { status: 409 });
      }
      throw e;
    }

    // הפעלה ברקע - לא ממתינים. ממשיך לרוץ כל עוד תהליך השרת חי.
    runOcrJob(job._id.toString()).catch((e) =>
      console.error('[ocr-job] runOcrJob threw:', e)
    );

    return NextResponse.json({ success: true, jobId: job._id.toString(), totalPages: totalToProcess });
  } catch (error) {
    console.error('OCR start error:', error);
    return serverError('Internal Server Error');
  }
}
