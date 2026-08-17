import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { validateEmail } from '@/lib/validation-utils';

// GET - כתובת ההתראות של המשתמש (וכתובת החשבון, כברירת המחדל האפקטיבית)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
    }

    await connectDB();

    const user = await User.findOne({ email: session.user.email })
      .select('email notificationEmail').lean();
    if (!user) {
      return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      notificationEmail: user.notificationEmail || null,
      accountEmail: user.email
    });
  } catch (error) {
    console.error('Error fetching notification email:', error);
    return NextResponse.json({ error: 'שגיאת שרת פנימית' }, { status: 500 });
  }
}

// PUT - עדכון כתובת ההתראות. מחרוזת ריקה מאפסת לכתובת החשבון.
export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 });
    }

    const raw = typeof body?.notificationEmail === 'string' ? body.notificationEmail.trim() : '';
    let notificationEmail = null;

    if (raw) {
      // codeql[js/polynomial-redos]: bound input length before testing.
      if (raw.length > 254 || !validateEmail(raw).isValid) {
        return NextResponse.json({ error: 'כתובת אימייל לא תקינה' }, { status: 400 });
      }
      notificationEmail = raw;
    }

    await connectDB();

    const user = await User.findOneAndUpdate(
      { email: session.user.email },
      { $set: { notificationEmail } },
      { returnDocument: 'after' }
    ).select('email notificationEmail');

    if (!user) {
      return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      notificationEmail: user.notificationEmail || null,
      accountEmail: user.email
    });
  } catch (error) {
    console.error('Error updating notification email:', error);
    return NextResponse.json({ error: 'שגיאת שרת פנימית' }, { status: 500 });
  }
}
