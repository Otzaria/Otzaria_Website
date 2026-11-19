import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import OcrJob from '@/models/OcrJob';
import { bookAllowed } from '@/lib/ocr/bookOcrAccess';
import { activeFilter } from '@/lib/ocr/localJobState';
import { APPLY_STARTED_MESSAGE_HE, cancelLocalJob, requestServerJobCancel } from '@/lib/ocr/localCancel';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

const NOT_FOUND_HE = 'לא נמצאה עבודה פעילה לביטול';

// POST /api/admin/books/ocr/cancel  { bookId } | { jobId }  (וגם /api/user/books/ocr/cancel — access)
// - gemini/ocrwin: מסמן בקשת ביטול; עבודת הרקע עוצרת בבדיקה הבאה בין הקבוצות/העמודים.
// - local: סוגר את העבודה מיד (cancelled, הספר משתחרר). אם החלת התוצאה כבר התחילה —
//   409 "הקליטה כבר החלה" (נעילת החלטה, src/lib/ocr/localCancel.js).
export async function cancelBookOcr(request, access) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, access.hasAccess);
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
    const job = await OcrJob.findOne({ ...query, ...activeFilter() }).select('_id method taskType book').lean();
    if (!job) return notFound(NOT_FOUND_HE);
    // מסלול הבעלים: העבודה חייבת להיות של ספר אישי שלו (גם בביטול לפי jobId)
    if (access.canUseBook) {
      const book = await Book.findById(job.book).select('_id ownerId').lean();
      if (!bookAllowed(access, book, session.user)) return notFound(NOT_FOUND_HE);
    }
    if (job.taskType === 'training') return NextResponse.json({ error: 'עצירת אימון מחייבת עצירה מבוקרת בתחנת האימון' }, { status: 409 });

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
