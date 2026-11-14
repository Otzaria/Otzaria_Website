import mongoose from 'mongoose';
import TzuratToken from '@/models/TzuratToken';
import { adminSessionOnly } from '@/lib/tzuratHadaf/session';
import { activeFilter, MAX_ACTIVE, parseCreateInput, publicToken, tokenPrefixOf } from '@/lib/tzuratHadaf/tokenRules';
import { generateToken, hashToken } from '@/lib/tzuratHadaf/tokenSecret';
import { json, badRequest, errorJson, serverError } from '@/lib/tzuratHadaf/respond';

// מפתחות-הגישה של מנהל המודול לכלי של צורת הדף (lib/tzuratHadaf/tokenRules.js). רק session — מפתח לעולם אינו
// יוצר, מציג או מבטל מפתחות (וה-proxy אינו מעביר לכאן בקשה בלי session). כל מנהל רואה רק את המפתחות שלו.
// GET  ← {tokens, active, max}
// POST {name, days?, scopes?} ← 201 {token, item} — המפתח עצמו מוחזר רק כאן, פעם אחת
export const dynamic = 'force-dynamic';
const LIST_LIMIT = 50;

export async function GET() {
  const { admin, denied } = await adminSessionOnly();
  if (denied) return denied;
  try {
    const now = new Date();
    const docs = await TzuratToken.find({ user: new mongoose.Types.ObjectId(admin.id) }).sort({ createdAt: -1 }).limit(LIST_LIMIT).lean();
    const tokens = docs.map((d) => publicToken(d, now));
    return json({ tokens, active: tokens.filter((t) => t.state === 'active').length, max: MAX_ACTIVE });
  } catch (e) {
    console.error('tzurat tokens GET', e?.name);
    return serverError();
  }
}

export async function POST(request) {
  const { admin, denied } = await adminSessionOnly();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    const now = new Date();
    const input = parseCreateInput(body, now);
    if (input.error) return badRequest(input.error);
    const uid = new mongoose.Types.ObjectId(admin.id);
    const full = () => errorJson(409, `יש כבר ${MAX_ACTIVE} מפתחות פעילים — בטלו מפתח שאינו בשימוש ונסו שוב`);
    if ((await TzuratToken.countDocuments(activeFilter(uid, now))) >= MAX_ACTIVE) return full();
    const secret = generateToken();
    const doc = await TzuratToken.create({
      user: uid,
      name: input.name,
      hash: hashToken(secret),
      prefix: tokenPrefixOf(secret),
      scopes: input.scopes,
      expiresAt: input.expiresAt,
    });
    // שתי יצירות במקביל עלולות לעבור את הבדיקה — אז זו שנוצרה עכשיו נמחקת
    if ((await TzuratToken.countDocuments(activeFilter(uid, now))) > MAX_ACTIVE) {
      await TzuratToken.deleteOne({ _id: doc._id });
      return full();
    }
    return json({ token: secret, item: publicToken(doc.toObject(), now) }, 201);
  } catch (e) {
    // בלי פרטי השגיאה: שגיאת-מסד עלולה לכלול את הגיבוב
    console.error('tzurat tokens POST', e?.name, e?.code);
    return serverError();
  }
}
