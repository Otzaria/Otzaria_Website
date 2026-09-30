import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import PageProofToken from '@/models/PageProofToken';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError, unauthorized } from '@/lib/apiResponse';
import { json, noStore } from '@/lib/pageProof/respond';
import { publicToken } from '@/lib/pageProof/tokenRules';

// DELETE: ביטול מפתח-גישה — מיד: כל בקשה במפתח קוראת אותו מהמסד (אין מטמון). הרשומה
// נשארת (revokedAt) לתיעוד. רק session, ורק מפתח של המשתמש עצמו (אחר ← 404).
// ← {success, item} (כבר בוטל — אותו דבר, already: true). private, no-store.

export async function DELETE(request, { params }) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return noStore(denied);
  const uid = session.user.id || session.user._id;
  if (!mongoose.Types.ObjectId.isValid(String(uid))) return noStore(unauthorized());
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return noStore(badRequest('מזהה לא תקין'));
    await connectDB();
    const own = { _id: new mongoose.Types.ObjectId(String(id)), user: new mongoose.Types.ObjectId(String(uid)) };
    const now = new Date();
    const doc = await PageProofToken.findOneAndUpdate({ ...own, revokedAt: null }, { $set: { revokedAt: now } }, { returnDocument: 'after', lean: true });
    if (doc) return json({ success: true, item: publicToken(doc, now) });
    const prev = await PageProofToken.findOne(own).lean();
    if (!prev) return noStore(notFound('המפתח לא נמצא'));
    return json({ success: true, item: publicToken(prev, now), already: true });
  } catch (e) {
    console.error('page-proof token DELETE', e?.name);
    return noStore(serverError());
  }
}
