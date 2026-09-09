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
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

// GET /api/admin/books/ocr/status?bookId=...
// מחזיר את ספירות העמודים (לקדם-בחירה) ואת העבודה האחרונה/הפעילה של הספר.
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');
    if (!bookId) {
      return badRequest('חסר מזהה ספר');
    }
    if (!mongoose.isValidObjectId(bookId)) {
      return badRequest('מזהה ספר לא תקין');
    }

    await connectDB();

    const book = await Book.findById(bookId).select('_id name').lean();
    if (!book) {
      return notFound('הספר לא נמצא');
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
    return serverError('Internal Server Error');
  }
}
