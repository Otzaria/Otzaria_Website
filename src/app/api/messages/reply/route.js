import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Message from '@/models/Message';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import mongoose from 'mongoose';
import { hasAnyAdminAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { unauthorized, forbidden, badRequest, notFound, serverError } from '@/lib/apiResponse';

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return unauthorized('לא מורשה');

        const { messageId, reply, fromAdminPanel } = await request.json();

        if (!messageId || !reply || !String(reply).trim()) {
            return badRequest('חסר מזהה הודעה או תוכן תגובה');
        }

        const userId = session?.user?._id || session?.user?.id;
        await connectDB();

        const isSentFromAdminInterface = fromAdminPanel === true && hasAnyAdminAccess(session?.user?.role);

        const message = await Message.findById(messageId).select('sender recipient allowReplies');
        if (!message) return notFound('ההודעה לא נמצאה');

        if (message.allowReplies === false) {
            return forbidden('לא ניתן להשיב על הודעת מערכת');
        }

        if (!isSentFromAdminInterface) {
            const userIdStr = String(userId);
            const isParticipant = String(message.sender) === userIdStr || String(message.recipient) === userIdStr;
            if (!isParticipant) return forbidden('אין גישה');
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);

        await Message.findByIdAndUpdate(messageId, {
            $push: {
                replies: {
                    sender: userObjectId,
                    content: String(reply),
                    createdAt: new Date(),
                    senderRole: isSentFromAdminInterface ? 'admin' : 'user',
                    senderName: session.user.name
                }
            },
            $set: {
                readBy: [userObjectId],
                
                isRead: isSentFromAdminInterface 
            }
        });

        revalidateNow(CACHE_TAGS.MESSAGES_ADMIN_LIST);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error replying to message:', error);
        const isDev = process.env.NODE_ENV !== 'production';
        return serverError(isDev ? error.message : 'אירעה שגיאה בלתי צפויה');
    }
}
