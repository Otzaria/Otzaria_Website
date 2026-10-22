import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import OcrJob from '@/models/OcrJob';
import { hasBookLibraryAccess } from '@/lib/roles';
import { activeFilter } from '@/lib/ocr/localJobState';
import { APPLY_STARTED_MESSAGE_HE, cancelLocalJob, requestServerJobCancel } from '@/lib/ocr/localCancel';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

const NOT_FOUND_HE = 'לא נמצאה עבודה פעילה לביטול';

// POST /api/admin/books/ocr/cancel  { bookId } | { jobId }
// - gemini/ocrwin: מסמן בקשת ביטול; עבודת הרקע עוצרת בבדיקה הבאה בין הקבוצות/העמודים.
// - local: סוגר את העבודה מיד (cancelled, הספר משתחרר). אם החלת התוצאה כבר התחילה —
//   409 "הקליטה כבר החלה" (נעילת החלטה, src/lib/ocr/localCancel.js).
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

    const query = jobId ? { _id: jobId } : { book: bookId };
    const job = await OcrJob.findOne({ ...query, ...activeFilter() }).select('_id method').lean();
    if (!job) return notFound(NOT_FOUND_HE);

    const opts = { reason: 'admin', byName: session.user?.name || '' };
    if (job.method === 'local') {
      const result = await cancelLocalJob(job._id, opts);
      if (!result.ok && result.code === 'apply_started') {
        return NextResponse.json(
          { error: APPLY_STARTED_MESSAGE_HE, code: 'apply_started' },
          { status: 409 }
        );
      }
      if (!result.ok) return notFound(NOT_FOUND_HE);
      return NextResponse.json({ success: true });
    }

    const result = await requestServerJobCancel(job._id, opts);
    if (!result.ok) return notFound(NOT_FOUND_HE);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('OCR cancel error:', error);
    return serverError('Internal Server Error');
  }
}
