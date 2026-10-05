import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireProofSession, volunteerStats } from '@/lib/pageProof/pool';
import { heldSequences, pageBrief, sequenceOfPage } from '@/lib/pageProof/claims';
import { recutPendingOf } from '@/lib/pageProof/recutRequests';
import { pendingSubmissionsOf } from '@/lib/pageProof/pendingSubmissions';
import { recutStatus } from '@/lib/pageProof/runtime';
import { json, noStore } from '@/lib/pageProof/respond';
import { serverError } from '@/lib/apiResponse';

// GET: "העמודים שלי" — מה שדף המתנדב (/library/page-proof) טוען בכניסה. קריאה
// בלבד: שום עמוד אינו נתפס, מתחדש או משתחרר כאן (תפיסה — רק בלחיצה מפורשת
// ברשת-העמודים של הספר; אין חלוקה אוטומטית).
// ← {success, held, recutPending, submitted, sequence, unavailable, stats, recutRequests}
//   recutRequests — האם "שלח לזיהוי-מחדש" פתוח עכשיו (מתג המנהל — runtime.recutStatus)
//   held        — הרצפים שבהם המתנדב מחזיק עכשיו עמודים שלא הגיש (claims.heldSequences)
//   recutPending — העמודים שהוא שלח לזיהוי-מחדש ועוד לא חזרו ({id, gid, title, page,
//                 requestedAt, picked} — recutRequests.recutPendingOf)
//   submitted   — ההגשות שלו שממתינות לבדיקת מנהל ({id, submissionId, gid, title, page, submittedAt,
//                 revision} — pendingSubmissions.pendingSubmissionsOf). הגשה אינה תופסת מקום מחמשת העמודים
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
    const [held, recutPending, submitted, sequence, stats, recut] = await Promise.all([
      heldSequences(userId, now),
      recutPendingOf(userId),
      pendingSubmissionsOf(userId),
      asked ? sequenceOfPage(asked, userId, now) : null,
      volunteerStats(userId),
      recutStatus({ now }),
    ]);
    let unavailable = null;
    if (pageId !== null && !sequence) unavailable = (asked && (await pageBrief(asked, userId, now))) || { id: asked };
    return json({ success: true, held, recutPending, submitted, sequence: sequence || null, unavailable, stats, recutRequests: recut.effective });
  } catch (e) {
    console.error('page-proof mine GET', e);
    return noStore(serverError());
  }
}
