import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Message from '@/models/Message';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function PUT(request) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { messageId } = await request.json();
    await connectDB();
    const message = await Message.findOne({ _id: messageId, recipient: session.user._id });
    if (!message && session.user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await Message.findByIdAndUpdate(messageId, { isRead: true });

    return NextResponse.json({ success: true });
}