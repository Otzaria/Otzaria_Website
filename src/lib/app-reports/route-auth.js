/**
 * הרשאת נתיבי הניהול של דיווחי התוכנה. התפקיד נטען מה-DB ולא מה-JWT, כדי שהסרת תפקיד תחול מיד.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { hasAppReportsAccess } from '@/lib/roles';

const NO_STORE = { 'cache-control': 'private, no-store' };
export const jsonNoStore = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** @returns {Promise<{ok:true, user:{id:string, name:string, role:string}}|{ok:false, response:Response}>} */
export async function requireAppReportsAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false, response: jsonNoStore({ error: 'Unauthorized' }, 401) };
  await connectDB();
  const user = await User.findById(session.user.id).select('name role').lean();
  if (!user || !hasAppReportsAccess(user.role)) return { ok: false, response: jsonNoStore({ error: 'Forbidden' }, 403) };
  return { ok: true, user: { id: String(user._id), name: user.name, role: user.role } };
}
