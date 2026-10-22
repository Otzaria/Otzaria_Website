import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import OcrJob from '@/models/OcrJob';
import { hasBookLibraryAccess } from '@/lib/roles';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

const SHA_RE = /^[0-9a-f]{64}$/;

// POST /api/admin/books/ocr/result-conflicts  { jobId, sha256 }
// סימון "נבדק" לתוצאה מתנגשת של עבודת OCR מקומי (תוצאה שנייה עם hash שונה שהגיעה אחרי שכבר
// ננעלה תוצאה — נשמרה כ-rejected-<sha>.json ולא הוחלה). הסימון קובע reviewedAt, ורק אחריו
// הניקוי השעתי (localCleanup) רשאי למחוק את הקובץ. אידמפוטנטי: סימון חוזר מחזיר את המועד הקיים.
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) || {};
    const jobId = body.jobId;
    const sha256 = typeof body.sha256 === 'string' ? body.sha256.toLowerCase() : '';
    if (!jobId || !mongoose.isValidObjectId(jobId)) return badRequest('מזהה עבודה לא תקין');
    if (!SHA_RE.test(sha256)) return badRequest('מזהה התוצאה אינו תקין');

    await connectDB();

    const now = new Date();
    await OcrJob.updateOne(
      { _id: jobId, method: 'local', resultConflicts: { $elemMatch: { sha256, reviewedAt: null } } },
      { $set: { 'resultConflicts.$.reviewedAt': now, 'resultConflicts.$.reviewedByName': session.user?.name || '' } }
    );

    const job = await OcrJob.findOne({ _id: jobId, method: 'local' }).select('resultConflicts').lean();
    const entry = (job?.resultConflicts || []).find((c) => c?.sha256 === sha256);
    if (!entry) return notFound('התוצאה המתנגשת לא נמצאה');

    return NextResponse.json(
      { success: true, sha256, reviewedAt: entry.reviewedAt ?? null, reviewedByName: entry.reviewedByName || '' },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('OCR result-conflict review error:', error);
    return serverError('Internal Server Error');
  }
}
