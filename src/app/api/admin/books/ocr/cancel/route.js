import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import OcrJob from '@/models/OcrJob';
import { hasBookLibraryAccess } from '@/lib/roles';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

// POST /api/admin/books/ocr/cancel  { bookId } | { jobId }
// מסמן בקשת ביטול; עבודת הרקע עוצרת בבדיקה הבאה בין הקבוצות/העמודים.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const { bookId, jobId } = (await request.json()) || {};
    if (!bookId && !jobId) {
      return badRequest('חסר מזהה ספר או עבודה');
    }
    if (jobId && !mongoose.isValidObjectId(jobId)) {
      return badRequest('מזהה עבודה לא תקין');
    }
    if (bookId && !mongoose.isValidObjectId(bookId)) {
      return badRequest('מזהה ספר לא תקין');
    }

    await connectDB();

    const query = jobId ? { _id: jobId } : { book: bookId, status: 'running' };
    const result = await OcrJob.updateOne(
      { ...query, status: 'running' },
      { $set: { cancelRequested: true } }
    );

    if (result.matchedCount === 0) {
      return notFound('לא נמצאה עבודה פעילה לביטול');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR cancel error:', error);
    return serverError('Internal Server Error');
  }
}
