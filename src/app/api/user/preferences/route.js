import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { unauthorized, badRequest, serverError } from '@/lib/apiResponse';

export async function POST(req) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return unauthorized();
    }

    const { action, bookPath } = await req.json();

    if (action === 'hide_instructions' && bookPath) {

      const userId = session.user._id || session.user.id;

      await User.findByIdAndUpdate(userId, {
        $addToSet: { hiddenInstructionsBooks: bookPath }
      });

      return NextResponse.json({ success: true, message: 'Preferences updated' });
    }

    return badRequest('Invalid parameters');

  } catch (error) {
    console.error('Error updating user preferences:', error);
    return serverError('Internal Server Error');
  }
}

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return unauthorized();
    }

    const user = await User.findById(session.user._id || session.user.id);

    return NextResponse.json({
      success: true,
      hiddenBooks: user.hiddenInstructionsBooks
    });

  } catch (error) {
    console.error('Error fetching user preferences:', error);
    return serverError('Internal Server Error');
  }
}
