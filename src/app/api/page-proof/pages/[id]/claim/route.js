import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import { requireProofSession } from '@/lib/pageProof/pool';
import { claimPage, releasePage } from '@/lib/pageProof/claims';
import { fromResult, noStore } from '@/lib/pageProof/respond';
import { badRequest, serverError } from '@/lib/apiResponse';

// תפיסת עמוד מרשת-העמודים ("תפוס ועבוד" / "תפוס כבודק שני") ושחרורו.
// POST   ← {success, page:{id, page, leasedUntil}} · 409 עם הסבר (נתפס בינתיים,
//          כבר הוגש, ממתין לזיהוי-מחדש, ספר מושהה, יותר מדי עמודים בידיים)
// DELETE ← {success} · 409 אם העמוד אינו של המתנדב או שכבר הגיש אותו

async function handle(params, action, label) {
  const { userId, error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return noStore(badRequest('מזהה עמוד לא תקין'));
    await connectDB();
    return fromResult(await action(id, userId));
  } catch (e) {
    console.error(`page-proof ${label}`, e);
    return noStore(serverError());
  }
}

export async function POST(request, { params }) {
  return handle(params, claimPage, 'claim POST');
}

export async function DELETE(request, { params }) {
  return handle(params, releasePage, 'claim DELETE');
}
