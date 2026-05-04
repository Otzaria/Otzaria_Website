import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Message from '@/models/Message';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyAdminAccess } from '@/lib/roles';

export async function DELETE(request) {
    const session = await getServerSession(authOptions);
    if (!hasAnyAdminAccess(session?.user?.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const { messageId } = await request.json();
    await connectDB();
    await Message.findByIdAndDelete(messageId);

    return NextResponse.json({ success: true });
}
