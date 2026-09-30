import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireProofSession, releaseLeases, volunteerStats } from '@/lib/pageProof/pool';
import { heldSequences, sequenceOfPage } from '@/lib/pageProof/claims';
import { badRequest, serverError } from '@/lib/apiResponse';

// GET — קריאה בלבד, לעולם אינו תופס עמודים (אין חלוקה אוטומטית: המתנדב בוחר עמודים רק
// ברשת-העמודים של הספר). הדף הנוכחי טוען את /api/page-proof/mine; כאן — לשונית ישנה:
//   ?page=<pageId> — הרצף של העמוד הזה אם הוא בטיפול המשתמש או שהגיש אותו, אחרת null;
//   בלי ?page=     — הרצף שבו המשתמש כבר מחזיק עמודים (שהתפיסה בו נגמרת ראשונה), או null.
//   ?skip= (של "רצף אחר" שהוסר) — מתעלמים ממנו.
// ← {success, sequence, stats}
export async function GET(request) {
  const { userId, error } = await requireProofSession();
  if (error) return error;
  try {
    await connectDB();
    const pageId = new URL(request.url).searchParams.get('page');
    const sequence =
      pageId !== null
        ? mongoose.Types.ObjectId.isValid(pageId)
          ? sequenceOfPage(pageId, userId)
          : Promise.resolve(null)
        : heldSequences(userId).then((held) => held[0] || null);
    const [seq, stats] = await Promise.all([sequence, volunteerStats(userId)]);
    return NextResponse.json(
      { success: true, sequence: seq || null, stats },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof GET', e);
    return serverError();
  }
}

// POST {action:'release', book?, seq?} (לשונית ישנה): שחרור הרצף המוחכר. עם book+seq — רק
// העמודים של הרצף הזה (עמודים שנתפסו ברשת-העמודים במקומות אחרים נשארים). רק שחרור.
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
