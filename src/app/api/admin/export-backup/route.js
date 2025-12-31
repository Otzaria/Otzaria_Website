import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (session?.user?.role !== 'admin') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await connectDB();

        // שליפת כל הנתונים (זהירות: במסד ענק זה עלול להיות כבד)
        // בפרודקשן אמיתי עדיף להשתמש ב-mongodump ברמת השרת
        const users = await User.find({}).lean();
        const books = await Book.find({}).lean();
        // עמודים הם רבים, אולי נדלג עליהם בייצוא JSON פשוט או נייצא רק טקסט
        
        const backupData = {
            date: new Date().toISOString(),
            users,
            books,
            // pages: ... (אופציונלי)
        };

        return new NextResponse(JSON.stringify(backupData, null, 2), {
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="otzaria-backup-${Date.now()}.json"`
            }
        });

    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}