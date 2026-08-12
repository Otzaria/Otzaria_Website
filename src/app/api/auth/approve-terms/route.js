import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { authOptions } from '../[...nextauth]/route';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
    }

    const { acceptReminders } = await request.json();

    if (!acceptReminders) {
      return NextResponse.json({ error: 'חובה לאשר' }, { status: 400 });
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
        return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
    }

    return NextResponse.json({ 
        message: 'הפרטים עודכנו בהצלחה',
        success: true 
    });

  } catch (error) {
    console.error('Error updating terms:', error);
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 });
  }
}
