import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import OcrJob from '@/models/OcrJob';
import { hasBookLibraryAccess } from '@/lib/roles';
import { reapStaleOcrJobs } from '@/lib/ocr/staleJobs';

// GET /api/admin/books/ocr/status?bookId=...
// מחזיר את ספירות העמודים (לקדם-בחירה) ואת העבודה האחרונה/הפעילה של הספר.
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasBookLibraryAccess(session.user?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');
    if (!bookId) {
      return NextResponse.json({ error: 'חסר מזהה ספר' }, { status: 400 });
    }
    if (!mongoose.isValidObjectId(bookId)) {
      return NextResponse.json({ error: 'מזהה ספר לא תקין' }, { status: 400 });
    }

    await connectDB();

    const book = await Book.findById(bookId).select('_id name').lean();
    if (!book) {
      return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 });
    }

    // סימון עבודות תקועות (שרת שהופעל מחדש באמצע) ככשל לפני הקריאה
    await reapStaleOcrJobs(book._id);

    const editedFilter = {
      book: book._id,
      $or: [{ content: { $gt: '' } }, { rightColumn: { $gt: '' } }, { leftColumn: { $gt: '' } }],
    };
    const [pagesWithImage, editedPagesCount, job] = await Promise.all([
      Page.countDocuments({ book: book._id, imagePath: { $gt: '' } }),
      Page.countDocuments(editedFilter),
      OcrJob.findOne({ book: book._id }).sort({ createdAt: -1 }).lean(),
    ]);

    return NextResponse.json({
      success: true,
      counts: { pagesWithImage, editedPagesCount },
      job: job
        ? {
            id: job._id.toString(),
            status: job.status,
            method: job.method,
            model: job.model,
            existingTextMode: job.existingTextMode,
            splitColumns: job.splitColumns,
            totalPages: job.totalPages,
            processedPages: job.processedPages,
            successPages: job.successPages,
            failedPages: job.failedPages,
            currentPageNumber: job.currentPageNumber,
            error: job.error,
            startedByName: job.startedByName,
            createdAt: job.createdAt,
            finishedAt: job.finishedAt,
          }
        : null,
    });
  } catch (error) {
    console.error('OCR status error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
