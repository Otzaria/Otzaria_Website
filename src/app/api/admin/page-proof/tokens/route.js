import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import PageProofToken from '@/models/PageProofToken';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError, unauthorized } from '@/lib/apiResponse';
import { json, noStore } from '@/lib/pageProof/respond';
import { activeFilter, MAX_ACTIVE, parseCreateInput, publicToken, tokenPrefixOf } from '@/lib/pageProof/tokenRules';
import { generateToken, hashToken } from '@/lib/pageProof/tokenSecret';

// מפתחות-הגישה של המנהל לתוכנת-הספר (lib/pageProof/tokenRules.js). רק session — בכוונה לא
// getPageProofSession: מפתח לעולם אינו יוצר, מציג או מבטל מפתחות (וה-proxy אינו מעביר
// לכאן בקשה בלי session). כל מנהל OCR רואה ומנהל רק את המפתחות שלו.
// GET  ← {success, tokens: [...], active, max} — בלי המפתח ובלי הגיבוב (publicToken)
// POST {name, days?, scopes?} ← 201 {success, token, item} — המפתח עצמו מוחזר רק כאן, פעם אחת
// private, no-store.

const LIST_LIMIT = 50;

async function gate() {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return { denied: noStore(denied) };
  const uid = session.user.id || session.user._id;
  if (!mongoose.Types.ObjectId.isValid(String(uid))) return { denied: noStore(unauthorized()) };
  return { uid: new mongoose.Types.ObjectId(String(uid)) };
}

export async function GET() {
  const { uid, denied } = await gate();
  if (denied) return denied;
  try {
    await connectDB();
    const now = new Date();
    const docs = await PageProofToken.find({ user: uid }).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean();
    const tokens = docs.map((d) => publicToken(d, now));
    return json({ success: true, tokens, active: tokens.filter((t) => t.state === 'active').length, max: MAX_ACTIVE });
  } catch (e) {
    console.error('page-proof tokens GET', e?.name);
    return noStore(serverError());
  }
}

export async function POST(request) {
  const { uid, denied } = await gate();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    const now = new Date();
    const input = parseCreateInput(body, now);
    if (input.error) return noStore(badRequest(input.error));

    await connectDB();
    const full = () => json({ success: false, error: `יש כבר ${MAX_ACTIVE} מפתחות פעילים — בטלו מפתח שאינו בשימוש ונסו שוב` }, 409);
    if ((await PageProofToken.countDocuments(activeFilter(uid, now))) >= MAX_ACTIVE) return full();

    const secret = generateToken();
    const doc = await PageProofToken.create({
      user: uid,
      name: input.name,
      hash: hashToken(secret),
      prefix: tokenPrefixOf(secret),
      scopes: input.scopes,
      expiresAt: input.expiresAt,
    });
    // שתי יצירות במקביל עלולות לעבור את הבדיקה שלמעלה — אז זו שנוצרה עכשיו נמחקת
    if ((await PageProofToken.countDocuments(activeFilter(uid, now))) > MAX_ACTIVE) {
      await PageProofToken.deleteOne({ _id: doc._id });
      return full();
    }
    return json({ success: true, token: secret, item: publicToken(doc.toObject(), now) }, 201);
  } catch (e) {
    // בלי פרטי השגיאה: שגיאת-מסד עלולה לכלול את הגיבוב
    console.error('page-proof tokens POST', e?.name, e?.code);
    return noStore(serverError());
  }
}
