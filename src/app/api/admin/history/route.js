import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import dbConnect from '@/lib/db';
import ReminderHistory from '@/models/reminderHistory';
import { hasBooksAccess } from '@/lib/roles';

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasBooksAccess(session.user?.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    await dbConnect();

    const history = await ReminderHistory.find({})
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    const formattedHistory = history.map(item => ({
      id: item._id.toString(),
      adminName: item.adminName || 'Unknown',
      bookName: item.bookName || 'Unknown Book',
      timestamp: item.timestamp,
      recipientCount: item.recipientCount || 0,
      isPartial: item.isPartial || false
    }));

    return NextResponse.json({ success: true, history: formattedHistory });

  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasBooksAccess(session.user?.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const text = await req.text();
    if (!text) return NextResponse.json({ success: false, error: 'Empty body' }, { status: 400 });
    
    const body = JSON.parse(text);
    const { bookName, bookPath, recipientCount, isPartial } = body;

    await dbConnect();

    const newLog = await ReminderHistory.create({
      adminName: session.user.name || 'Admin',
      adminEmail: session.user.email,
      bookName,
      bookPath,
      recipientCount: recipientCount || 0,
      isPartial: isPartial || false,
      timestamp: new Date()
    });

    return NextResponse.json({ success: true, log: newLog });

  } catch (error) {
    console.error('Error saving history:', error);
    return NextResponse.json({ success: false, error: 'Failed to save history log' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasBooksAccess(session.user?.role)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing ID' }, { status: 400 });
    }

    await dbConnect();
    await ReminderHistory.findByIdAndDelete(id);

    return NextResponse.json({ success: true, id });

  } catch (error) {
    console.error('Error deleting history item:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete' }, { status: 500 });
  }
}