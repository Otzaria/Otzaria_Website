/**
 * הרשאת נתיבי הניהול של משוב החיפוש: מנהל כללי ומאמן מודלים. התפקיד נטען מה-DB כדי שהסרתו תחול מיד.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { hasSearchFeedbackAccess } from '@/lib/roles';

const NO_STORE = { 'cache-control': 'private, no-store' };
export const jsonNoStore = (body, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** @returns {Promise<{ok:true}|{ok:false, response:Response}>} */
export async function requireSearchFeedbackAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { ok: false, response: jsonNoStore({ error: 'נדרשת התחברות' }, 401) };
  await connectDB();
  const user = await User.findById(session.user.id).select('role').lean();
  if (!user || !hasSearchFeedbackAccess(user.role)) return { ok: false, response: jsonNoStore({ error: 'אין הרשאה לצפות במשוב החיפוש' }, 403) };
  return { ok: true };
}
