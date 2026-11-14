import mongoose from 'mongoose';
import TzuratToken from '@/models/TzuratToken';
import { adminSessionOnly } from '@/lib/tzuratHadaf/session';
import { publicToken } from '@/lib/tzuratHadaf/tokenRules';
import { json, badRequest, notFound, serverError } from '@/lib/tzuratHadaf/respond';

// DELETE — ביטול מפתח-גישה, מיד. הרשומה נשארת (revokedAt). רק session, ורק מפתח של המשתמש עצמו (אחר ← 404).
// ← {item} (כבר בוטל — אותו דבר, already: true)
export async function DELETE(request, { params }) {
  const { admin, denied } = await adminSessionOnly();
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return badRequest('מזהה לא תקין');
    const own = { _id: new mongoose.Types.ObjectId(String(id)), user: new mongoose.Types.ObjectId(admin.id) };
    const now = new Date();
    const doc = await TzuratToken.findOneAndUpdate({ ...own, revokedAt: null }, { $set: { revokedAt: now } }, { returnDocument: 'after', lean: true });
    if (doc) return json({ item: publicToken(doc, now) });
    const prev = await TzuratToken.findOne(own).lean();
    if (!prev) return notFound('המפתח לא נמצא');
    return json({ item: publicToken(prev, now), already: true });
  } catch (e) {
    console.error('tzurat token DELETE', e?.name);
    return serverError();
  }
}
