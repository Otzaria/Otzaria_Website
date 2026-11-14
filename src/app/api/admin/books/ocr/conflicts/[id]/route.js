import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import { hasBookLibraryAccess } from '@/lib/roles';
import { resolveConflict } from '@/lib/ocr/ocrConflictResolve';
import { CONFLICT_ACTIONS, parseClientDate, serializeConflict } from '@/lib/ocr/ocrConflictView';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

const PAGE_FIELDS = '_id content rightColumn leftColumn isTwoColumns updatedAt';

const conflictResponse = (error, code, status = 409) =>
  NextResponse.json({ error, code }, { status });

// POST /api/admin/books/ocr/conflicts/:id  { action: 'apply' | 'dismiss', expectedPageUpdatedAt? }
// - dismiss: הטקסט הקיים בעמוד נשאר; ההתנגשות מסומנת dismissed (רק אם עדיין open).
// - apply: אימוץ טקסט ה-OCR — רק בהחלטה מפורשת של מנהל, ומותנה ב-updatedAt של העמוד כפי שהמנהל
//   ראה אותו (expectedPageUpdatedAt). אם העמוד נערך שוב בינתיים — 409, ושום דבר לא נדרס.
//   ההכרעה נתפסת לפני כתיבת העמוד (open → applying → applied), כך שדחייה במקביל נכשלת ב-409
//   apply_in_progress ולא מסתיימת ב"נשמר הקיים" עם טקסט OCR בעמוד. פירוט והתאוששות מקריסה:
//   src/lib/ocr/ocrConflictResolve.js.
const FAILURES = {
  not_found: () => notFound('ההתנגשות לא נמצאה'),
  page_missing: () => notFound('העמוד כבר לא קיים בספר'),
  page_changed: () => conflictResponse('העמוד השתנה שוב — רעננו', 'page_changed'),
  already_resolved: () => conflictResponse('ההתנגשות כבר טופלה — רעננו', 'already_resolved'),
  apply_in_progress: () => conflictResponse('אימוץ טקסט ה-OCR בתהליך — רעננו בעוד רגע', 'apply_in_progress'),
};

export async function POST(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) return badRequest('מזהה התנגשות לא תקין');

    const body = (await request.json().catch(() => null)) || {};
    const { action } = body;
    if (!CONFLICT_ACTIONS.includes(action)) return badRequest('פעולה לא חוקית');
    const expected = action === 'apply' ? parseClientDate(body.expectedPageUpdatedAt) : null;
    if (action === 'apply' && !expected) return badRequest('חסר מועד העדכון של העמוד');

    await connectDB();

    const result = await resolveConflict({ id, action, expected, byName: session.user?.name || '' });
    if (!result.ok) return FAILURES[result.code]();

    const page = await Page.findById(result.conflict.page).select(PAGE_FIELDS).lean();
    return NextResponse.json(
      { success: true, conflict: serializeConflict(result.conflict, page) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('OCR conflict action error:', error);
    return serverError('Internal Server Error');
  }
}
