import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';

// GET - קבלת הגדרות התראות של המשתמש
export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();
    
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      notifications: user.uploadNotifications || {
        enabled: false,
        dicta: false,
        fullBook: false,
        singlePage: false
      }
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT - עדכון הגדרות התראות
export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();
    
    const { enabled, dicta, fullBook, singlePage } = await request.json();
    
    const user = await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $set: {
          uploadNotifications: {
            enabled,
            dicta,
            fullBook,
            singlePage
          }
        }
      },
      { new: true }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      notifications: user.uploadNotifications
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
