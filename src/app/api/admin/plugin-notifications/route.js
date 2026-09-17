import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import { requirePluginsAdmin } from '@/lib/adminAuth';

// GET - קבלת הגדרות התראות על תוספים של המשתמש
export async function GET() {
  try {
    const auth = await requirePluginsAdmin();
    if (!auth.ok) return auth.response;
    const { session } = auth;

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
    const auth = await requirePluginsAdmin();
    if (!auth.ok) return auth.response;
    const { session } = auth;

    await connectDB();
    
    const { enabled } = await request.json();
    
    const user = await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $set: {
          'pluginNotifications.enabled': enabled
        }
      },
      { returnDocument: 'after' }
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
