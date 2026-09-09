import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyAdminAccess } from '@/lib/roles';
import { requireAccess, serverError } from '@/lib/apiResponse';

// רשימת משתמשים בסיסית לצורך בחירת נמען בהודעות — נגיש לכל סוגי המנהלים
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasAnyAdminAccess);
    if (denied) return denied;

    await connectDB();

    const users = await User.find({ role: 'user' })
      .select('_id name email')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, users });
  } catch (e) {
    return serverError();
  }
}
