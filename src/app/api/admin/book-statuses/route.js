import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { hasBookLibraryAccess } from '@/lib/roles';

// ברירות מחדל לסטטוסים
const DEFAULT_STATUSES = {
  not_checked: {
    label: 'לא נבדק',
    color: '#94a3b8' // slate-400
  },
  needs_attention: {
    label: 'דורש טיפול',
    color: '#f59e0b' // amber-500
  },
  ready: {
    label: 'תקין ומוכן להכנסה',
    color: '#10b981' // emerald-500
  },
  added_to_library: {
    label: 'הוכנס לספרייה',
    color: '#3b82f6' // blue-500
  }
};

// GET - קבלת הגדרות סטטוסים
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasBookLibraryAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();
    
    const config = await SystemConfig.findOne({ key: 'book_statuses' });
    
    return NextResponse.json({
      success: true,
      statuses: config?.value || DEFAULT_STATUSES
    });
  } catch (error) {
    console.error('Error fetching book statuses:', error);
    return NextResponse.json({ error: 'Failed to fetch statuses' }, { status: 500 });
  }
}

// POST - עדכון הגדרות סטטוסים
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasBookLibraryAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { statuses } = await request.json();
    
    if (!statuses || typeof statuses !== 'object') {
      return NextResponse.json({ error: 'Invalid statuses data' }, { status: 400 });
    }

    await connectDB();
    
    const config = await SystemConfig.findOneAndUpdate(
      { key: 'book_statuses' },
      { 
        value: statuses,
        lastUpdatedBy: session.user.id,
        description: 'הגדרות סטטוסים לספרים'
      },
      { upsert: true, new: true }
    );
    
    return NextResponse.json({
      success: true,
      statuses: config.value
    });
  } catch (error) {
    console.error('Error updating book statuses:', error);
    return NextResponse.json({ error: 'Failed to update statuses' }, { status: 500 });
  }
}
