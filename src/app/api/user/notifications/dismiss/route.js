import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/db';
import User from '@/models/User';
import { unauthorized, notFound, serverError } from '@/lib/apiResponse';

export async function POST() {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);

    if (!session) {
      return unauthorized();
    }

    const user = await User.findById(session.user._id || session.user.id);
    if (!user) {
      return notFound('User not found');
    }

    user.lastSubscriptionReminderDismissedAt = new Date();
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error dismissing reminder:', error);
    return serverError('Internal server error');
  }
}