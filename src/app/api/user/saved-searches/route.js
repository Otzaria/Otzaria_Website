import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { unauthorized, notFound, serverError } from '@/lib/apiResponse';

// שליפת נתונים
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return unauthorized();
    }

    await connectDB();
    const user = await User.findOne({ email: session.user.email }).select('savedSearches');

    return NextResponse.json({ success: true, savedSearches: user?.savedSearches || [] });
  } catch (error) {
    console.error('Error fetching searches:', error);
    return serverError('Internal Server Error');
  }
}

export async function PUT(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return unauthorized();
    }

    const { savedSearches } = await req.json();

    await connectDB();

    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      { $set: { savedSearches: savedSearches } },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return notFound('User not found');
    }

    return NextResponse.json({ success: true, savedSearches: updatedUser.savedSearches });
  } catch (error) {
    console.error('Error saving searches:', error);
    return serverError('Internal Server Error');
  }
}
