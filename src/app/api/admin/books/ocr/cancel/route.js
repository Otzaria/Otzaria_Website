import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import OcrJob from '@/models/OcrJob';
import { hasBookLibraryAccess } from '@/lib/roles';

// POST /api/admin/books/ocr/cancel  { bookId } | { jobId }
// מסמן בקשת ביטול; עבודת הרקע עוצרת בבדיקה הבאה בין הקבוצות/העמודים.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasBookLibraryAccess(session.user?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { bookId, jobId } = (await request.json()) || {};
    if (!bookId && !jobId) {
      return NextResponse.json({ error: 'חסר מזהה ספר או עבודה' }, { status: 400 });
    }
    if (jobId && !mongoose.isValidObjectId(jobId)) {
      return NextResponse.json({ error: 'מזהה עבודה לא תקין' }, { status: 400 });
    }
    if (bookId && !mongoose.isValidObjectId(bookId)) {
      return NextResponse.json({ error: 'מזהה ספר לא תקין' }, { status: 400 });
    }

    await connectDB();

    const query = jobId ? { _id: jobId } : { book: bookId, status: 'running' };
    const result = await OcrJob.updateOne(
      { ...query, status: 'running' },
      { $set: { cancelRequested: true } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'לא נמצאה עבודה פעילה לביטול' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR cancel error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
