import connectDB from '@/lib/db';
import { requireProofSession } from '@/lib/pageProof/pool';
import { claimSequence } from '@/lib/pageProof/claims';
import { fromResult, gidParam, noStore } from '@/lib/pageProof/respond';
import { badRequest, serverError } from '@/lib/apiResponse';

// POST {seq}: "תפוס את 5 העמודים" — העמודים הפנויים (למתנדב) ברצף הזה
// נשמרים עבורו ל-CLAIM_HOURS שעות, עד MAX_HELD עמודים בסך הכול (gridState.js).
// עמודים תפוסים/שהוגשו נשארים כמו שהם.
// ← {success, claimed, limited, pages:[{id, page}]} · 409 כשאין מה לתפוס/ספר מושהה/תקרה
export async function POST(request, { params }) {
  const { userId, error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    const gid = gidParam((await params).gid);
    if (!gid) return noStore(badRequest('מזהה ספר לא תקין'));
    const body = await request.json().catch(() => null);
    const seq = typeof body?.seq === 'number' ? body.seq : Number.NaN;
    if (!Number.isInteger(seq) || seq < 0) return noStore(badRequest('מספר רצף לא תקין'));
    await connectDB();
    return fromResult(await claimSequence(gid, seq, userId));
  } catch (e) {
    console.error('page-proof claim-seq POST', e);
    return noStore(serverError());
  }
}
