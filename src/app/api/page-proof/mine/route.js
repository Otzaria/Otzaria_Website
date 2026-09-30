import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireProofSession, volunteerStats } from '@/lib/pageProof/pool';
import { heldSequences, pageBrief, sequenceOfPage } from '@/lib/pageProof/claims';
import { json, noStore } from '@/lib/pageProof/respond';
import { serverError } from '@/lib/apiResponse';

// GET: "העמודים שלי" — מה שדף המתנדב (/library/page-proof) טוען בכניסה. קריאה
// בלבד: שום עמוד אינו נתפס, מתחדש או משתחרר כאן (תפיסה — רק בלחיצה מפורשת
// ברשת-העמודים של הספר; אין חלוקה אוטומטית).
// ← {success, held, sequence, unavailable, stats}
//   held        — הרצפים שבהם המתנדב מחזיק עכשיו עמודים שלא הגיש (claims.heldSequences)
//   ?page=<id>  — sequence: הרצף של העמוד הזה אם הוא בטיפול המתנדב או שהגיש אותו;
//                 אחרת sequence:null ו-unavailable: {id, gid, page, state} (או
//                 {id} לעמוד שאינו קיים) — כדי להסביר ולהפנות לרשת של הספר
export async function GET(request) {
  const { userId, error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    await connectDB();
    const pageId = new URL(request.url).searchParams.get('page');
    const asked = pageId && mongoose.Types.ObjectId.isValid(pageId) ? pageId : null;
    const now = new Date();
    const [held, sequence, stats] = await Promise.all([
      heldSequences(userId, now),
      asked ? sequenceOfPage(asked, userId, now) : null,
      volunteerStats(userId),
    ]);
    let unavailable = null;
    if (pageId !== null && !sequence) unavailable = (asked && (await pageBrief(asked, userId, now))) || { id: asked };
    return json({ success: true, held, sequence: sequence || null, unavailable, stats });
  } catch (e) {
    console.error('page-proof mine GET', e);
    return noStore(serverError());
  }
}
