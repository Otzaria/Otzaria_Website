import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Message from '@/models/Message';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import mongoose from 'mongoose';
import { hasAnyAdminAccess } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        
        await connectDB();
        
        const { searchParams } = new URL(request.url);
        const showAll = searchParams.get('allMessages'); 

        let query = {};
        
        if (hasAnyAdminAccess(session.user.role) && showAll === 'true') {
             query = {}; 
        } else {
            query = { 
                $or: [
                    { sender: session.user._id },
                    { recipient: session.user._id }
                ]
            };
        }

        const messages = await Message.find(query)
            .populate('sender', 'name email role')
            .populate('replies.sender', 'name email role')
            .sort({ createdAt: -1 })
            .lean();

        const formattedMessages = messages.map(msg => ({
            id: msg._id.toString(), 
            subject: msg.subject,
            content: msg.content,
            sender: msg.sender,
            isRead: msg.isRead,
            readBy: (msg.readBy || []).map(id => id.toString()),
            senderName: msg.sender?.name || 'משתמש לא ידוע',
            senderEmail: msg.sender?.email,
            status: !msg.isRead ? 'unread' : (msg.replies?.length > 0 ? 'replied' : 'read'),
            createdAt: msg.createdAt,
            replies: (msg.replies || []).map(r => ({
                id: r._id.toString(),
                sender: r.sender?._id || r.sender,
                senderName: r.sender?.name,
                senderEmail: r.sender?.email,
                senderRole: r.sender?.role,
                content: r.content,
                createdAt: r.createdAt
            }))
        }));

        return NextResponse.json({ success: true, messages: formattedMessages });
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { subject, content, recipientId } = await request.json();
        await connectDB();

        await Message.create({
            sender: session.user._id,
            recipient: recipientId || null,
            subject,
            content,
            isRead: false,
            readBy: []
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error sending message:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request) {
    console.log('🔄 PUT Request Started');
    
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            console.log('❌ Unauthorized PUT request');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { messageIds } = await request.json();
        const userIdString = session.user._id || session.user.id;

        console.log('👤 User attempting update:', userIdString);
        console.log('📩 Messages IDs to update:', messageIds);

        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            console.log('⚠️ No IDs provided');
            return NextResponse.json({ success: true }); 
        }

        await connectDB();

        let userObjectId;
        let messageObjectIds = [];

        try {
            userObjectId = new mongoose.Types.ObjectId(userIdString);
            
            messageObjectIds = messageIds.map(id => new mongoose.Types.ObjectId(id));
        } catch (e) {
            console.error('❌ Conversion Error:', e);
            return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
        }

        console.log(`🛠️ Executing DB Update...`);
        console.log(`   Query IDs:`, messageObjectIds);
        console.log(`   Adding User:`, userObjectId);

        const result = await Message.updateMany(
            { _id: { $in: messageObjectIds } },
            { 
                $addToSet: { readBy: userObjectId }
            }
        );

        if (result.matchedCount === 0) {
            console.error('⚠️ CRITICAL: No messages matched the IDs provided!');
        }

        return NextResponse.json({ 
            success: true, 
            debug: { matched: result.matchedCount, modified: result.modifiedCount } 
        });

    } catch (error) {
        console.error('❌ FATAL ERROR in PUT:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}