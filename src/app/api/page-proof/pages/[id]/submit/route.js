import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import { requireProofSession, whoOf } from '@/lib/pageProof/pool';
import { validateOps, compactOps } from '@/lib/pageProof/ops';
import { badRequest, notFound, serverError } from '@/lib/apiResponse';

const MAX_NOTE = 1000;

// POST {ops, note}: הגשת התיקונים של עמוד אחד. הפעולות נדחסות ונבדקות מול
// העמוד השמור (אותם כללים כמו בעורך). ההגשה תמיד ממתינה לאישור מנהל.
// תפיסת-המקום אטומית: מצליחה רק אם העמוד עדיין פתוח, המשתמש לא הגיש אותו,
// והוא מוחכר לו או פנוי — כך עמוד כפול לא יקבל שתי הגשות מאותו אדם.
export async function POST(request, { params }) {
  const { session, userId, error } = await requireProofSession();
  if (error) return error;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badRequest('מזהה עמוד לא תקין');
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.ops)) return badRequest('רשימת תיקונים חסרה');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : '';

    await connectDB();
    const page = await PageProofPage.findById(id, { doc: 1, gid: 1, page: 1, book: 1, required: 1 }).lean();
    if (!page) return notFound('העמוד לא נמצא');

    // שדות פנימיים של העורך לא נשמרים; רק צורת החוזה
    const clean = body.ops.map((o) => {
      const op = { kind: o?.kind, page: o?.page };
      if (Array.isArray(o?.ids)) op.ids = o.ids;
      if (o?.value !== undefined) op.value = o.value;
      return op;
    });
    const ops = compactOps(page.doc, clean);
    const invalid = validateOps(page.doc, ops);
    if (invalid) return badRequest(invalid);

    const uid = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const claimed = await PageProofPage.findOneAndUpdate(
      {
        _id: id,
        status: 'open',
        submitters: { $ne: uid },
        $or: [{ leasedBy: uid }, { leasedUntil: null }, { leasedUntil: { $lt: now } }],
      },
      { $inc: { activeCount: 1 }, $push: { submitters: uid }, $set: { leasedBy: null, leasedUntil: null } },
      { returnDocument: 'after', lean: true }
    );
    if (!claimed) {
      return NextResponse.json(
        { success: false, error: 'העמוד כבר הוגש או נלקח בידי מתנדב אחר' },
        { status: 409 }
      );
    }

    let sub;
    try {
      sub = await PageProofSubmission.create({
        page: page._id,
        book: page.book,
        gid: page.gid,
        pageNo: page.page,
        user: uid,
        userName: session.user.name || '',
        who: whoOf(userId),
        ops,
        opCount: ops.length,
        note,
      });
    } catch (e) {
      // ביטול תפיסת-המקום — אחרת העמוד "תקוע" עם מונה שאין מאחוריו הגשה
      await PageProofPage.updateOne({ _id: id }, { $inc: { activeCount: -1 }, $pull: { submitters: uid } });
      throw e;
    }

    if (claimed.activeCount >= claimed.required) {
      await PageProofPage.updateOne({ _id: id, activeCount: { $gte: claimed.required } }, { $set: { status: 'done' } });
    }

    return NextResponse.json({ success: true, submissionId: String(sub._id), opCount: ops.length });
  } catch (e) {
    console.error('page-proof submit', e);
    return serverError();
  }
}
