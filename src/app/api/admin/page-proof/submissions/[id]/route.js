import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import PageProofSubmission from '@/models/PageProofSubmission';
import PageProofPage from '@/models/PageProofPage';
import PageProofBook from '@/models/PageProofBook';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { editorPageShape } from '@/lib/pageProof/pool';
import { validateOps, compactOps } from '@/lib/pageProof/ops';

async function gate(params) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return { denied };
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) return { denied: badRequest('מזהה לא תקין') };
  return { session, id };
}

// GET: הגשה אחת + העמוד (לתצוגת העורך) + שאר ההגשות לאותו עמוד (כפולים)
export async function GET(request, { params }) {
  const { id, denied } = await gate(params);
  if (denied) return denied;
  try {
    await connectDB();
    const sub = await PageProofSubmission.findById(id).lean();
    if (!sub) return notFound('ההגשה לא נמצאה');
    const [page, book, siblings] = await Promise.all([
      PageProofPage.findById(sub.page).lean(),
      PageProofBook.findById(sub.book, { title: 1, script: 1 }).lean(),
      PageProofSubmission.find({ page: sub.page, _id: { $ne: sub._id } }, { ops: 0 }).sort({ createdAt: 1 }).lean(),
    ]);
    if (!page) return notFound('העמוד של ההגשה לא נמצא');
    return NextResponse.json(
      {
        success: true,
        page: editorPageShape(page, book),
        submission: {
          id: String(sub._id),
          status: sub.status,
          userName: sub.userName,
          who: sub.who,
          ops: sub.ops,
          note: sub.note,
          createdAt: sub.createdAt,
          reviewedByName: sub.reviewedByName,
          reviewedAt: sub.reviewedAt,
          reviewNote: sub.reviewNote,
          reviewerEdited: sub.reviewerEdited,
          exportedAt: sub.exportedAt,
        },
        siblings: siblings.map((s) => ({ id: String(s._id), userName: s.userName, status: s.status, opCount: s.opCount })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof submission GET', e);
    return serverError();
  }
}

// PATCH {action:'approve'|'reject', note?, ops?}
//   approve — מ-submitted בלבד. ops (אופציונלי) = הפעולות אחרי תיקון המנהל.
//   reject  — מ-submitted, או ממאושרת שעוד לא יצאה בקובץ-תיקונים. העמוד
//             חוזר למאגר (המקום מתפנה, ומי שהגיש יכול לקבל אותו שוב).
export async function PATCH(request, { params }) {
  const { session, id, denied } = await gate(params);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    const reviewer = {
      reviewedBy: session.user.id || session.user._id,
      reviewedByName: session.user.name || '',
      reviewedAt: new Date(),
      reviewNote: note,
    };
    await connectDB();
    const sub = await PageProofSubmission.findById(id, { page: 1, user: 1, status: 1, exportedAt: 1 }).lean();
    if (!sub) return notFound('ההגשה לא נמצאה');

    if (body.action === 'approve') {
      const set = { status: 'approved', ...reviewer };
      if (Array.isArray(body.ops)) {
        const page = await PageProofPage.findById(sub.page, { doc: 1 }).lean();
        const ops = compactOps(page.doc, body.ops.map((o) => ({ kind: o?.kind, page: o?.page, ...(Array.isArray(o?.ids) ? { ids: o.ids } : {}), ...(o?.value !== undefined ? { value: o.value } : {}) })));
        const invalid = validateOps(page.doc, ops);
        if (invalid) return badRequest(invalid);
        Object.assign(set, { ops, opCount: ops.length, reviewerEdited: true });
      }
      const done = await PageProofSubmission.findOneAndUpdate({ _id: id, status: 'submitted' }, { $set: set }, { returnDocument: 'after', lean: true });
      if (!done) return NextResponse.json({ success: false, error: 'ההגשה כבר טופלה' }, { status: 409 });
      await PageProofPage.updateOne({ _id: sub.page }, { $inc: { approvedCount: 1 } });
      return NextResponse.json({ success: true, status: 'approved', opCount: done.opCount });
    }

    if (body.action === 'reject') {
      // המצב שלפני העדכון (returnDocument: before) — לא מהקריאה המוקדמת,
      // שעלולה להתיישן אם מנהל אחר אישר בינתיים
      const prev = await PageProofSubmission.findOneAndUpdate(
        { _id: id, $or: [{ status: 'submitted' }, { status: 'approved', exportedAt: null }] },
        { $set: { status: 'rejected', ...reviewer } },
        { returnDocument: 'before', lean: true }
      );
      if (!prev) return NextResponse.json({ success: false, error: 'אי אפשר לדחות הגשה שכבר יצאה בקובץ-תיקונים' }, { status: 409 });
      const wasApproved = prev.status === 'approved';
      await PageProofPage.updateOne(
        { _id: sub.page },
        { $inc: { activeCount: -1, ...(wasApproved ? { approvedCount: -1 } : {}) }, $pull: { submitters: sub.user }, $set: { status: 'open' } }
      );
      return NextResponse.json({ success: true, status: 'rejected' });
    }

    return badRequest('פעולה לא מוכרת');
  } catch (e) {
    console.error('page-proof submission PATCH', e);
    return serverError();
  }
}
