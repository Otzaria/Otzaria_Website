import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireProofSession, claimSequence, releaseLeases, volunteerStats } from '@/lib/pageProof/pool';
import { sequenceOfPage } from '@/lib/pageProof/claims';
import { badRequest, serverError } from '@/lib/apiResponse';

// GET: "רצף אחר" — הרצף הנוכחי של המתנדב, או רצף חדש שנתפס עבורו + סטטיסטיקה.
// תופס עמודים, ולכן הדף קורא לזה רק בלחיצה מפורשת ("רצף אחר"), לעולם לא
// בטעינה — הטעינה היא GET /api/page-proof/mine (קריאה בלבד).
// ?skip=<bookId>:<seq> — הרצף שדולג עכשיו לא יוצע שוב באותה בקשה.
// ?page=<pageId> (לקוח ישן) — הרצף של העמוד הזה אם הוא בטיפול המשתמש או שהגיש
// אותו; אחרת sequence:null — בלי לתפוס רצף אחר במקומו.
export async function GET(request) {
  const { userId, error } = await requireProofSession();
  if (error) return error;
  try {
    await connectDB();
    const sp = new URL(request.url).searchParams;
    const skip = sp.get('skip');
    const pageId = sp.get('page');
    const asked = pageId !== null ? (mongoose.Types.ObjectId.isValid(pageId) ? sequenceOfPage(pageId, userId) : Promise.resolve(null)) : null;
    const [sequence, stats] = await Promise.all([asked || claimSequence(userId, skip), volunteerStats(userId)]);
    return NextResponse.json(
      { success: true, sequence, stats },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof GET', e);
    return serverError();
  }
}

// POST {action:'release', book?, seq?}: שחרור הרצף המוחכר (דילוג). עם book+seq —
// רק העמודים של הרצף הזה (עמודים שנתפסו ברשת-העמודים במקומות אחרים נשארים).
export async function POST(request) {
  const { userId, error } = await requireProofSession();
  if (error) return error;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action !== 'release') return badRequest('פעולה לא מוכרת');
    await connectDB();
    const seq = Number.isInteger(body.seq) ? body.seq : null;
    const book = typeof body.book === 'string' && mongoose.Types.ObjectId.isValid(body.book) ? body.book : null;
    const released = await releaseLeases(userId, { book, seq });
    return NextResponse.json({ success: true, released });
  } catch (e) {
    console.error('page-proof POST', e);
    return serverError();
  }
}
