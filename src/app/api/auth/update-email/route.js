import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { apiError, unauthorized, badRequest, notFound, serverError } from '@/lib/apiResponse';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return unauthorized('לא מחובר');
    }

    const { email: newEmail } = await request.json();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // codeql[js/polynomial-redos]: bound input length before testing.
    if (!newEmail || newEmail.length > 254 || !emailRegex.test(newEmail)) {
      return badRequest('כתובת אימייל לא תקינה');
    }

    await connectDB();

    const emailOwner = await User.findOne({ email: newEmail });
    if (emailOwner && emailOwner._id.toString() !== session.user.id) {
      return apiError(409, 'כתובת המייל הזו כבר תפוסה על ידי משתמש אחר');
    }

    const updatedUser = await User.findByIdAndUpdate(
      session.user.id, // Assuming session.user.id holds the user's MongoDB _id
      { 
        $set: {
            email: newEmail,
            isVerified: false,
            verificationToken: null,
            verificationTokenExpiry: null,
            acceptReminders: false
        }
      },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return notFound('משתמש לא נמצא');
    }

    return NextResponse.json({
        message: 'המייל עודכן בהצלחה',
        user: { email: updatedUser.email }
    }, { status: 200 });

  } catch (error) {
    console.error("Error updating email:", error);
    return serverError('שגיאת שרת פנימית');
  }
}