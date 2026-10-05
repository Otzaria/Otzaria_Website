import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import connectDB from '@/lib/db';
import PageProofBook from '@/models/PageProofBook';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import PageProofDraft from '@/models/PageProofDraft';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { IMAGE_ROOT } from '@/lib/pageProof/importPackages';
import { removeThumbs } from '@/lib/pageProof/thumbs';
import { getPageProofSession, getSessionOnly } from '@/lib/pageProof/tokenAuth';

const GID_RE = /^[A-Za-z0-9]{8,64}$/;

// auth: getPageProofSession(...) / getSessionOnly()
async function gate(params, auth) {
  const { session, denied: keyDenied } = await auth;
  if (keyDenied) return { denied: keyDenied };
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return { denied };
  const { gid } = await params;
  if (!GID_RE.test(String(gid))) return { denied: badRequest('gid לא תקין') };
  return { gid };
}

// PATCH {status: 'active'|'paused'}: השהיית חלוקה / חידוש.
// גם במפתח-גישה של תוכנת-הספר (import — פרסום עמודים להגהה).
export async function PATCH(request, { params }) {
  const { gid, denied } = await gate(params, getPageProofSession(request, 'import'));
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    if (!['active', 'paused'].includes(body.status)) return badRequest('מצב לא מוכר');
    await connectDB();
    const book = await PageProofBook.findOneAndUpdate({ gid }, { $set: { status: body.status } }, { returnDocument: 'after', lean: true });
    if (!book) return notFound('הספר לא נמצא');
    return NextResponse.json({ success: true, status: book.status });
  } catch (e) {
    console.error('page-proof book PATCH', e);
    return serverError();
  }
}

// DELETE: מחיקת הספר, עמודיו, ההגשות והתמונות — כולל התמונות הממוזערות של
// רשת-העמודים, שאינן בתיקיית הספר. הגשות מאושרות שלא יצאו בקובץ-תיקונים
// יאבדו — הלקוח מזהיר לפני כן (unexported במונים).
// רק session — לעולם לא במפתח-גישה (גם לא עם כל ההרשאות).
export async function DELETE(request, { params }) {
  const { gid, denied } = await gate(params, getSessionOnly());
  if (denied) return denied;
  try {
    await connectDB();
    const book = await PageProofBook.findOne({ gid }).lean();
    if (!book) return notFound('הספר לא נמצא');
    const pageIds = (await PageProofPage.find({ book: book._id }, { _id: 1 }).lean()).map((p) => String(p._id));
    await PageProofSubmission.deleteMany({ book: book._id });
    // הטיוטות בשרת (docs/63 §2) — לפי gid (בטיוטה אין שדה book)
    await PageProofDraft.deleteMany({ gid });
    await PageProofPage.deleteMany({ book: book._id });
    await PageProofBook.deleteOne({ _id: book._id });
    const dir = resolveImageFsPath(`${IMAGE_ROOT}/${gid}`);
    if (path.basename(dir) === gid) await fs.remove(dir);
    try {
      await removeThumbs(pageIds);
    } catch (e) {
      // הספר כבר נמחק; ממוזערת שנשארה אינה נגישה (אין עמוד) — רק רושמים
      console.error('page-proof book DELETE thumbs', e);
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('page-proof book DELETE', e);
    return serverError();
  }
}
