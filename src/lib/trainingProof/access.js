import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import TrainingProofVolunteer from '@/models/TrainingProofVolunteer';
import { accessOf, canProof } from '@/lib/trainingProof/accessRules';

// השער היחיד בשרת לכל נתיבי /api/training-proof ו-/api/admin/training-proof
// (docs/76 §8.2). 401 = לא מחובר; 403 = מחובר בלי גישה. בתשובת ה-403 יש גם
// access (pending/denied/…), כדי שהדף יציג "אין לך הרשאת גישה לדף זה" + "בקשת גישה".
//
// אפשרויות:
//   admin: true   — רק מנהל OCR (מסכי הניהול)
//   anyone: true  — כל מחובר (בקשת-גישה ומצב-הגישה); מחזיר את access בלי לחסום
//
// מחזיר {session, userId, access, isAdmin, volunteer} או {error}.
export async function requireTrainingProofSession({ admin = false, anyone = false } = {}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: NextResponse.json({ success: false, error: 'יש להתחבר' }, { status: 401 }) };
  const u = session.user;
  const userId = u.id || u._id;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { error: NextResponse.json({ success: false, error: 'מזהה משתמש לא תקין' }, { status: 401 }) };
  }
  await connectDB();
  const volunteer = await TrainingProofVolunteer.findOne({ userId: String(userId) }).lean();
  const access = accessOf(u, volunteer);
  const isAdmin = access === 'admin';
  const ok = { session, userId: String(userId), access, isAdmin, volunteer };
  if (anyone) return ok;
  if (admin ? !isAdmin : !canProof(access)) {
    return {
      error: NextResponse.json({ success: false, error: 'אין לך הרשאת גישה לדף זה', access }, { status: 403 }),
    };
  }
  return ok;
}
