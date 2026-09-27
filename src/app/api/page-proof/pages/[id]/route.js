import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PageProofPage from '@/models/PageProofPage';
import PageProofBook from '@/models/PageProofBook';
import PageProofSubmission from '@/models/PageProofSubmission';
import { requireProofSession, renewLease, editorPageShape } from '@/lib/pageProof/pool';
import { hasOcrAccess } from '@/lib/roles';
import { badRequest, notFound, forbidden, serverError } from '@/lib/apiResponse';

// GET: עמוד לעורך. מתנדב — רק עמוד שמוחכר לו (ההחכרה מתחדשת) או עמוד שכבר
// הגיש (לצפייה, עם הפעולות שלו). מנהל OCR — כל עמוד, לקריאה.
export async function GET(request, { params }) {
  const { session, userId, error } = await requireProofSession();
  if (error) return error;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badRequest('מזהה עמוד לא תקין');
    await connectDB();

    const [page, mine] = await Promise.all([
      PageProofPage.findById(id).lean(),
      PageProofSubmission.findOne({ page: id, user: userId, status: { $ne: 'rejected' } }, { ops: 1, status: 1, note: 1 }).lean(),
    ]);
    if (!page) return notFound('העמוד לא נמצא');

    let mode = 'view';
    if (!mine) {
      const renewed = await renewLease(id, userId);
      if (renewed) mode = 'edit';
      else if (!hasOcrAccess(session.user.role)) return forbidden('העמוד הזה אינו ברצף שלך');
    }

    const book = await PageProofBook.findById(page.book, { title: 1, script: 1 }).lean();
    return NextResponse.json(
      {
        success: true,
        mode,
        page: editorPageShape(page, book),
        submission: mine ? { id: String(mine._id), status: mine.status, ops: mine.ops, note: mine.note } : null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof page GET', e);
    return serverError();
  }
}
