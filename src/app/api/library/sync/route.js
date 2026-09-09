import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { canManageLibrarySync } from '@/lib/roles';
import { pullLibraryBooks } from '@/lib/dicta/library-sync';
import { unauthorized, forbidden, serverError } from '@/lib/apiResponse';

// משיכה/ייבוא מגיטהאב (כיוון אחד). דחיפה 3-way נוספת בשלב 5.
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    await connectDB();
    const userDoc = await User.findById(session.user.id).select('role isSupervisor').lean();
    if (!canManageLibrarySync(userDoc)) {
      return forbidden();
    }

    const body = await req.json().catch(() => ({}));
    const onlyNew = body?.onlyNew === true;

    const result = await pullLibraryBooks({ onlyNew });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Library pull sync failed:', error);
    return serverError();
  }
}
