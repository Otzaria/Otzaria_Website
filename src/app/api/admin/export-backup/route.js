import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export const dynamic = 'force-dynamic'; // מונע קאש סטטי

function sanitizeUser(userDoc) {
    const user = userDoc.toObject ? userDoc.toObject() : userDoc;
    const {
        password,
        resetPasswordToken,
        resetPasswordExpires,
        verificationToken,
        verificationTokenExpires,
        verificationRequestHistory,
        lastResetRequest,
        dailyResetRequestsCount,
        ...safeUser
    } = user;
    return safeUser;
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (session?.user?.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await connectDB();

        // יצירת Stream במקום לטעון הכל לזיכרון (מניעת DoS/Memory Crash)
        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                
                // התחלת JSON
                controller.enqueue(encoder.encode('{\n"date": "' + new Date().toISOString() + '",\n'));
                
                // 1. הזרמת משתמשים
                controller.enqueue(encoder.encode('"users": ['));
                let isFirstUser = true;
                
                // שימוש ב-Cursor של Mongoose כדי לרוץ על המסמכים אחד אחד
                for await (const user of User.find({}).cursor()) {
                    if (!isFirstUser) controller.enqueue(encoder.encode(','));
                    controller.enqueue(encoder.encode(JSON.stringify(sanitizeUser(user))));
                    isFirstUser = false;
                }
                controller.enqueue(encoder.encode('],\n'));

                // 2. הזרמת ספרים
                controller.enqueue(encoder.encode('"books": ['));
                let isFirstBook = true;
                
                for await (const book of Book.find({}).cursor()) {
                    if (!isFirstBook) controller.enqueue(encoder.encode(','));
                    controller.enqueue(encoder.encode(JSON.stringify(book)));
                    isFirstBook = false;
                }
                controller.enqueue(encoder.encode(']\n}'));
                
                // סיום
                controller.close();
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="otzaria-backup-${Date.now()}.json"`,
                'Cache-Control': 'no-cache'
            }
        });

    } catch (error) {
        console.error('Backup Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
