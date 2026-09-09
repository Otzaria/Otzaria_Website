import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { hash, compare } from 'bcryptjs';
import { unauthorized, badRequest, serverError } from '@/lib/apiResponse';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    const { currentPassword, newPassword } = await request.json();

    if (!newPassword || newPassword.length < 8) {
        return badRequest('הסיסמה החדשה חייבת להכיל לפחות 8 תווים');
    }

    await connectDB();

    // שליפת המשתמש עם הסיסמה (בדרך כלל הסיסמה לא נשלפת בדיפולט)
    const user = await User.findById(session.user._id);

    // אימות סיסמה ישנה
    const isValid = await compare(currentPassword, user.password);
    if (!isValid) {
      return badRequest('הסיסמה הנוכחית שגויה');
    }

    // הצפנה ושמירה
    const hashedPassword = await hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    return NextResponse.json({ success: true, message: 'הסיסמה שונתה בהצלחה' });
  } catch (error) {
    return serverError('Internal Server Error');
  }
}