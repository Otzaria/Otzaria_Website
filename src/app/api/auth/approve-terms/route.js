import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { authOptions } from '../[...nextauth]/route';
import { unauthorized, badRequest, notFound, serverError } from '@/lib/apiResponse';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return unauthorized('לא מחובר');
    }

    const { acceptReminders } = await request.json();

    if (!acceptReminders) {
      return badRequest('חובה לאשר');
    }

    await connectDB();

    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $set: { acceptReminders: true }
      },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
        return notFound('משתמש לא נמצא');
    }

    return NextResponse.json({
        message: 'הפרטים עודכנו בהצלחה',
        success: true
    });

  } catch (error) {
    console.error('Error updating terms:', error);
    return serverError('שגיאת שרת');
  }
}
