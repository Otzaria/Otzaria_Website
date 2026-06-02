import connectDB from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { canModerateLibrary, canManageLibrarySync } from '@/lib/roles';

/**
 * מאמת מפקח/מנהל. מחזיר { userDoc } או { error, status }.
 * level='sync' דורש הרשאת ניהול סנכרון (מנהלי ספרים בלבד).
 */
export async function requireModerator(level = 'moderate') {
  const session = await getServerSession(authOptions);
  if (!session) return { error: 'Unauthorized', status: 401 };

  await connectDB();
  const userDoc = await User.findById(session.user.id).select('role isSupervisor name');
  const ok = level === 'sync' ? canManageLibrarySync(userDoc) : canModerateLibrary(userDoc);
  if (!ok) return { error: 'Forbidden', status: 403 };

  return { userDoc };
}
