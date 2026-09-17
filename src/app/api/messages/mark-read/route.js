import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Message from '@/models/Message';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasAnyAdminAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { unauthorized, forbidden } from '@/lib/apiResponse';

export async function PUT(request) {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    const { messageId } = await request.json();
    await connectDB();
    const message = await Message.findOne({ _id: messageId, recipient: session.user._id });
    if (!message && !hasAnyAdminAccess(session.user.role)) {
        return forbidden();
    }
    await Message.findByIdAndUpdate(messageId, { isRead: true });

    // "סמן כנקרא" הוא פעולת מנהל מפורשת (לא עדכון readBy עקיף) — משנה את
    // isRead שעליו מבוסס שדה status בתור הניהול, ולכן מבטלים מיד ולא
    // מסתמכים על חלון הגיבוי.
    revalidateNow(CACHE_TAGS.MESSAGES_ADMIN_LIST);

    return NextResponse.json({ success: true });
}