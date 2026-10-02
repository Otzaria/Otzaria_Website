import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PageProofPage from '@/models/PageProofPage';
import PageProofBook from '@/models/PageProofBook';
import PageProofSubmission from '@/models/PageProofSubmission';
import { requireProofSession, editorPageShape } from '@/lib/pageProof/pool';
import { renewLease } from '@/lib/pageProof/claims';
import { sameRevision, storedRevision, submissionRevision } from '@/lib/pageProof/importRules';
import { hasOcrAccess } from '@/lib/roles';
import { recutStatus } from '@/lib/pageProof/runtime';
import { badRequest, notFound, forbidden, serverError } from '@/lib/apiResponse';

// GET: עמוד לעורך. מתנדב — רק עמוד שבטיפולו (התפיסה בתוקף; הפתיחה מחדשת אותה
// ל-48 שעות מלאות — claims.renewLease) או עמוד שכבר הגיש (לצפייה, עם הפעולות
// שלו). עמוד פנוי אינו נתפס כאן: תפיסה רק בלחיצה מפורשת ברשת-העמודים.
// מנהל OCR — כל עמוד, לקריאה.
// "כבר הגיש" = הגשה לגרסה הנוכחית של העמוד: עמוד שחזר מזיהוי-מחדש (גרסה
// חדשה) נפתח לעריכה גם למי שהגיש את הגרסה הקודמת. בקשה לזיהוי-מחדש (recutRequest)
// אינה הגשה.
export async function GET(request, { params }) {
  const { session, userId, error } = await requireProofSession();
  if (error) return error;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badRequest('מזהה עמוד לא תקין');
    await connectDB();

    const [page, subs] = await Promise.all([
      PageProofPage.findById(id).lean(),
      PageProofSubmission.find({ page: id, user: userId, status: { $ne: 'rejected' }, recutRequest: { $ne: true } }, { ops: 1, status: 1, note: 1, revision: 1 })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    if (!page) return notFound('העמוד לא נמצא');
    const revision = storedRevision(page);
    const mine = subs.find((s) => sameRevision(submissionRevision(s), revision)) || null;

    let mode = 'view';
    if (!mine) {
      const renewed = await renewLease(id, userId);
      if (renewed) mode = 'edit';
      else if (!hasOcrAccess(session.user.role)) return forbidden('העמוד הזה אינו בטיפולכם — אפשר לתפוס אותו ברשת-העמודים של הספר');
    }

    const [book, recut] = await Promise.all([PageProofBook.findById(page.book, { title: 1, script: 1 }).lean(), recutStatus()]);
    return NextResponse.json(
      {
        success: true,
        mode,
        page: editorPageShape(page, book),
        submission: mine ? { id: String(mine._id), status: mine.status, ops: mine.ops, note: mine.note } : null,
        // "שלח לזיהוי-מחדש" פתוח עכשיו? (מתג המנהל — runtime.recutStatus)
        recutRequests: recut.effective,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof page GET', e);
    return serverError();
  }
}
