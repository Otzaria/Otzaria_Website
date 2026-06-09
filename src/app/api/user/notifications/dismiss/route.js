import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/db';
import User from '@/models/User';

export async function POST() {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await User.findById(session.user._id || session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    user.lastSubscriptionReminderDismissedAt = new Date();
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error dismissing reminder:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}