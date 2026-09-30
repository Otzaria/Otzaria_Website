import connectDB from '@/lib/db';
import { requireProofSession } from '@/lib/pageProof/pool';
import { bookPages } from '@/lib/pageProof/claims';
import { gidParam, json, noStore } from '@/lib/pageProof/respond';
import { badRequest, notFound, serverError } from '@/lib/apiResponse';

// GET: כל עמודי הספר עם המצב בעיני המתנדב — לרשת-העמודים (בחירת עמוד/רצף).
// ספר מושהה מוחזר עם book.active=false (מי שמחזיק בו עמודים ממשיך בהם).
export async function GET(request, { params }) {
  const { userId, error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    const gid = gidParam((await params).gid);
    if (!gid) return noStore(badRequest('מזהה ספר לא תקין'));
    await connectDB();
    const data = await bookPages(gid, userId);
    if (!data) return noStore(notFound('הספר לא נמצא'));
    return json({ success: true, ...data });
  } catch (e) {
    console.error('page-proof book GET', e);
    return noStore(serverError());
  }
}
