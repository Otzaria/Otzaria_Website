import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route'; 
import connectDB from '@/lib/db';
import User from '@/models/User';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
    }

    const { email: newEmail } = await request.json();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // codeql[js/polynomial-redos]: bound input length before testing.
    if (!newEmail || newEmail.length > 254 || !emailRegex.test(newEmail)) {
      return NextResponse.json({ error: 'כתובת אימייל לא תקינה' }, { status: 400 });
    }

    await connectDB();

    const emailOwner = await User.findOne({ email: newEmail });
    if (emailOwner && emailOwner._id.toString() !== session.user.id) {
      return NextResponse.json(
        { error: 'כתובת המייל הזו כבר תפוסה על ידי משתמש אחר' }, 
        { status: 409 }
      );
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
      { new: true }
    );

    if (!updatedUser) {
      return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
    }

    return NextResponse.json({ 
        message: 'המייל עודכן בהצלחה', 
        user: { email: updatedUser.email } 
    }, { status: 200 });

  } catch (error) {
    console.error("Error updating email:", error);
    return NextResponse.json({ error: 'שגיאת שרת פנימית' }, { status: 500 });
  }
}