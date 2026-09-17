import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Message from '@/models/Message';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyAdminAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { requireAccess } from '@/lib/apiResponse';

export async function DELETE(request) {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasAnyAdminAccess);
    if (denied) return denied;

    const { messageId } = await request.json();
    await connectDB();
    await Message.findByIdAndDelete(messageId);

    revalidateNow(CACHE_TAGS.MESSAGES_ADMIN_LIST);

    return NextResponse.json({ success: true });
}
