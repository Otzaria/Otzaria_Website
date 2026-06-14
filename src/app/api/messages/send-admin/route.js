import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Message from '@/models/Message';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import mongoose from 'mongoose';
import { hasAnyAdminAccess, ALL_ADMIN_ROLES } from '@/lib/roles';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!hasAnyAdminAccess(session?.user?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { recipientId, subject, message, sendToAll } = await request.json();
    await connectDB();

    // יצירת מזהה מנהל תקין למסד הנתונים
    const adminId = new mongoose.Types.ObjectId(session.user._id || session.user.id);

    if (sendToAll) {
      // שליפה של כל המשתמשים (למעט האדמין עצמו)
      const users = await User.find({ role: { $nin: ALL_ADMIN_ROLES } }).select('_id');
      
      const messages = users.map(user => ({
        sender: adminId,
        recipient: user._id,
        subject,
        content: message,
        isRead: true, 
        readBy: [adminId] 
      }));

      await Message.insertMany(messages);
      
      return NextResponse.json({ 
        success: true, 
        message: `נשלח בהצלחה ל-${users.length} משתמשים` 
      });

    } else {
      if (!recipientId) return NextResponse.json({ error: 'Missing recipient' }, { status: 400 });

      await Message.create({
        sender: adminId,
        recipient: recipientId,
        subject,
        content: message,
        isRead: true,
        readBy: [adminId]
      });

      return NextResponse.json({ success: true, message: 'נשלח בהצלחה' });
    }

  } catch (error) {
    console.error('Error sending admin message:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}