import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import User from '@/models/User';
import MailingList from '@/models/MailingList';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';

export async function GET() {
    try {
        // 1. אבטחה: רק אדמין
        const session = await getServerSession(authOptions);
        if (!session || !hasBookLibraryAccess(session.user?.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await connectDB();

        // 2. שליפת המסמך של רשימת התפוצה הספציפית
        const list = await MailingList.findOne({ listName: 'new_books_subscribers' });
        
        // אם הרשימה ריקה או לא קיימת
        if (!list || !list.emails || list.emails.length === 0) {
            return NextResponse.json({ success: true, subscribers: [] });
        }

        // 3. שליפת השמות מטבלת המשתמשים לפי המיילים שנמצאו ברשימה
        // אנחנו משתמשים ב-$in כדי למצוא את כל המשתמשים שהמייל שלהם מופיע ברשימה
        const users = await User.find({ 
            email: { $in: list.emails } 
        }).select('name email');

        return NextResponse.json({ success: true, subscribers: users });

    } catch (error) {
        console.error('Error fetching subscribers:', error);
        return NextResponse.json({ error: 'Server Error' }, { status: 500 });
    }
}
