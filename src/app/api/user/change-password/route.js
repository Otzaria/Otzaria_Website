import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { hash, compare } from 'bcryptjs';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { currentPassword, newPassword } = await request.json();
    
    if (!newPassword || newPassword.length < 8) {
        return NextResponse.json({ error: 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים' }, { status: 400 });
    }

    await connectDB();
    
    // שליפת המשתמש עם הסיסמה (בדרך כלל הסיסמה לא נשלפת בדיפולט)
    const user = await User.findById(session.user._id);

    // אימות סיסמה ישנה
    const isValid = await compare(currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'הסיסמה הנוכחית שגויה' }, { status: 400 });
    }

    // הצפנה ושמירה
    const hashedPassword = await hash(newPassword, 12);
    user.password = hashedPassword;
    await user.save();

    return NextResponse.json({ success: true, message: 'הסיסמה שונתה בהצלחה' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}