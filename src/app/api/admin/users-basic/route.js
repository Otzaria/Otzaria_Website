import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyAdminAccess } from '@/lib/roles';

// רשימת משתמשים בסיסית לצורך בחירת נמען בהודעות — נגיש לכל סוגי המנהלים
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!hasAnyAdminAccess(session?.user?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();

    const users = await User.find({ role: 'user' })
      .select('_id name email')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ success: true, users });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
