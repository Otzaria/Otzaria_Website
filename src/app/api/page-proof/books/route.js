import connectDB from '@/lib/db';
import { requireProofSession } from '@/lib/pageProof/pool';
import { listBooks } from '@/lib/pageProof/claims';
import { json, noStore } from '@/lib/pageProof/respond';
import { serverError } from '@/lib/apiResponse';

// GET: הספרים הפעילים בהגהת-עמודים — לכל ספר מונים לפי מצב בעיני המתנדב
// (פנויים / בטיפולך / תפוסים / הוגשו / אושרו / ...) והעמוד הראשון לתמונה.
export async function GET() {
  const { userId, error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    await connectDB();
    return json({ success: true, books: await listBooks(userId) });
  } catch (e) {
    console.error('page-proof books GET', e);
    return noStore(serverError());
  }
}
