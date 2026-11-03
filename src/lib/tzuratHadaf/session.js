import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { hasTzuratAdminAccess } from '@/lib/roles';
import { requireAccess } from '@/lib/apiResponse';
import { errorJson, noStore } from './respond';
import { getTzuratSession } from './tokenAuth';

// צורת הדף — השערים של הראוטים.
//
// requireTzuratSession() — מתנדב: 401 בלי session, 403 בלי אימות (isVerified) אלא אם הוא מנהל המודול.
// הדגל tzuratPracticeDone נקרא מהמסד בכל בקשה — הוא משתנה בלי התחברות מחדש.
// ← {session, userId, user: {id, name}, isAdmin, practiceDone} או {error}
//
// adminGate(request, scope) — מנהל המודול: session, או מפתח-גישה tht_ עם ההרשאה (read/review/import).
// ← {session, admin: {id, name}} או {denied}

export async function requireTzuratSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: errorJson(401, 'יש להתחבר') };
  const u = session.user;
  const isAdmin = hasTzuratAdminAccess(u.role);
  if (!u.isVerified && !isAdmin) return { error: errorJson(403, 'רק משתמשים מאומתים יכולים להשתתף בבדיקת צורת הדף') };
  const userId = String(u.id || u._id || '');
  if (!mongoose.Types.ObjectId.isValid(userId)) return { error: errorJson(401, 'מזהה משתמש לא תקין') };
  await connectDB();
  const flags = await User.findById(userId, { tzuratPracticeDone: 1 }).lean();
  if (!flags) return { error: errorJson(401, 'המשתמש לא נמצא') };
  return {
    session,
    userId,
    user: { id: userId, name: u.name || '' },
    isAdmin,
    practiceDone: !!flags.tzuratPracticeDone,
  };
}

export async function adminGate(request, scope) {
  const { session, denied: keyDenied } = await getTzuratSession(request, scope);
  if (keyDenied) return { denied: noStore(keyDenied) };
  const denied = requireAccess(session, hasTzuratAdminAccess);
  if (denied) return { denied: noStore(denied) };
  await connectDB();
  const id = String(session.user.id || session.user._id || '');
  return { session, admin: { id, name: session.user.name || '' } };
}

// רק session (ניהול המפתחות — לעולם לא במפתח)
export async function adminSessionOnly() {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasTzuratAdminAccess);
  if (denied) return { denied: noStore(denied) };
  const id = String(session.user.id || session.user._id || '');
  if (!mongoose.Types.ObjectId.isValid(id)) return { denied: errorJson(401, 'מזהה משתמש לא תקין') };
  await connectDB();
  return { session, admin: { id, name: session.user.name || '' } };
}
