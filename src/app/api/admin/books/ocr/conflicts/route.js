import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import OcrConflict from '@/models/OcrConflict';
import OcrJob from '@/models/OcrJob';
import { hasBookLibraryAccess } from '@/lib/roles';
import { CONFLICT_STATUSES, PENDING_CONFLICT_STATUSES, parsePaging, serializeConflict } from '@/lib/ocr/ocrConflictView';
import { settleStaleConflictApplies } from '@/lib/ocr/ocrConflictResolve';
import { badRequest, requireAccess, serverError } from '@/lib/apiResponse';

// GET /api/admin/books/ocr/conflicts?jobId=...|bookId=...[&status=open][&limit=50][&offset=0]
// (status=open כולל גם applying — ממתינות להחלטה)
// התנגשויות בהחלת תוצאת OCR מקומי (עמוד שנערך אחרי יצירת העבודה ולכן לא נדרס), ממוינות לפי
// מספר עמוד, כל אחת עם טקסט ה-OCR ועם הטקסט הנוכחי של העמוד ו-updatedAt שלו (לאימוץ מותנה),
// ועם מזהה ותאריך העבודה שיצרה אותה (jobId, jobCreatedAt) — ברשימה ברמת הספר יש כמה עבודות.
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    const bookId = searchParams.get('bookId');
    const status = searchParams.get('status');
    if (!jobId && !bookId) return badRequest('חסר מזהה עבודה או ספר');
    if (jobId && !mongoose.isValidObjectId(jobId)) return badRequest('מזהה עבודה לא תקין');
    if (bookId && !mongoose.isValidObjectId(bookId)) return badRequest('מזהה ספר לא תקין');
    if (status && !CONFLICT_STATUSES.includes(status)) return badRequest('סינון מצב לא תקין');
    const { limit, offset } = parsePaging(searchParams);
    // A stable key survives resolutions by another administrator between pages. Keep offset for older clients.
    let after = null;
    if (searchParams.has('after')) {
      const raw = searchParams.get('after');
      try { after = raw.length <= 256 ? JSON.parse(raw) : null; } catch { /* invalid cursor */ }
      if (!after || typeof after.id !== 'string' || !/^[a-f0-9]{24}$/i.test(after.id)
        || !(after.pageNumber === null || (Number.isSafeInteger(after.pageNumber) && after.pageNumber > 0))) {
        return badRequest('סמן דפדוף לא תקין');
      }
    }

    await connectDB();

    const scope = jobId ? { job: jobId } : { book: bookId };
    // אימוץ שנקטע בקריסה (applying שה-lease שלו פג) — מוכרע לפי העמוד לפני ההצגה והספירה
    await settleStaleConflictApplies(scope);
    // status=open = "ממתינות להחלטה" (open+applying, כמו openCount): אימוץ בתהליך לא נעלם מהרשימה
    const filter = status
      ? { ...scope, status: status === 'open' ? { $in: PENDING_CONFLICT_STATUSES } : status }
      : { ...scope };

    const pageFilter = after ? { ...filter, $or: [
      { pageNumber: after.pageNumber, _id: { $gt: new mongoose.Types.ObjectId(after.id) } },
      { pageNumber: after.pageNumber === null ? { $ne: null } : { $gt: after.pageNumber } },
    ] } : filter;
    const [total, openCount, batch] = await Promise.all([
      OcrConflict.countDocuments(filter),
      OcrConflict.countDocuments({ ...filter, status: { $in: PENDING_CONFLICT_STATUSES } }),
      OcrConflict.find(pageFilter).sort({ pageNumber: 1, _id: 1 }).skip(after ? 0 : offset).limit(limit + 1).lean(),
    ]);
    const conflicts = batch.slice(0, limit);
    const last = conflicts.at(-1);

    const pageIds = conflicts.map((c) => c.page);
    const jobIds = [...new Set(conflicts.map((c) => String(c.job)))];
    const [pages, jobs] = await Promise.all([
      pageIds.length
        ? Page.find({ _id: { $in: pageIds } })
          .select('_id content rightColumn leftColumn isTwoColumns updatedAt')
          .lean()
        : [],
      jobIds.length ? OcrJob.find({ _id: { $in: jobIds } }).select('_id createdAt').lean() : [],
    ]);
    const byId = new Map(pages.map((p) => [String(p._id), p]));
    const jobsById = new Map(jobs.map((j) => [String(j._id), j]));

    return NextResponse.json(
      {
        success: true,
        total,
        openCount,
        hasMore: batch.length > limit,
        nextCursor: last ? JSON.stringify({ pageNumber: last.pageNumber ?? null, id: String(last._id) }) : null,
        conflicts: conflicts.map((c) => serializeConflict(c, byId.get(String(c.page)) ?? null, jobsById.get(String(c.job)) ?? null)),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('OCR conflicts list error:', error);
    return serverError('Internal Server Error');
  }
}
