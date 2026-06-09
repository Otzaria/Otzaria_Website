import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { hasPluginsAccess } from '@/lib/roles';

// GET - קבלת הגדרות התראות על תוספים של המשתמש
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasPluginsAccess(session.user?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();
    
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      enabled: user.pluginNotifications?.enabled || false
    });
  } catch (error) {
    console.error('Error fetching plugin notification settings:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PUT - עדכון הגדרות התראות על תוספים
export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasPluginsAccess(session.user?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();
    
    const { enabled } = await request.json();
    
    const user = await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $set: {
          'pluginNotifications.enabled': enabled
        }
      },
      { new: true }
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      enabled: user.pluginNotifications?.enabled || false
    });
  } catch (error) {
    console.error('Error updating plugin notification settings:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
