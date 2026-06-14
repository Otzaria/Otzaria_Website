import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import User from '@/models/User';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function POST(request) {
    try {
        // 1. אימות סשן
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id || session.user._id;
        if (!userId) {
             return NextResponse.json({ success: false, error: 'User ID missing' }, { status: 450 });
        }

        // 2. חילוץ נתונים מהבקשה
        const { bookPath, pageNumber } = await request.json();

        // 3. חיבור לבסיס הנתונים (פעם אחת)
        await connectDB();

        // 4. בדיקת סטטוס המשתמש (acceptReminders)
        const user = await User.findById(userId);
        if (!user || !user.acceptReminders) {
            return NextResponse.json({ 
                success: false, 
                error: 'TERMS_REQUIRED',
                redirectUrl: '/library/auth/approve-terms-on-edit'
            }, { status: 403 });
        }

        // 5. מציאת הספר והעמוד
        const book = await Book.findOne({ slug: decodeURIComponent(bookPath) });
        if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

        const page = await Page.findOne({ book: book._id, pageNumber });
        if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

        // 6. בדיקות בעלות (האם תפוס/הושלם ע"י אחר) — אדמין/admin_books עוקף
        const isAdmin = hasBooksAccess(session.user.role);
        const isClaimedByOther = page.claimedBy && page.claimedBy.toString() !== userId.toString();
        
        if ((page.status === 'in-progress' || page.status === 'completed') && isClaimedByOther && !isAdmin) {
             return NextResponse.json({ 
                success: false, 
                error: `העמוד כבר ${page.status === 'completed' ? 'הושלם' : 'בטיפול'} ע"י משתמש אחר` 
            }, { status: 409 });
        }

        // 7. לוגיקת עדכון
        const wasCompleted = page.status === 'completed';

        page.status = 'in-progress';
        page.claimedBy = new mongoose.Types.ObjectId(userId);
        page.claimedAt = new Date();
        page.completedAt = undefined; 
        await page.save();

        // 8. עדכונים רוחביים (מונה ספר ונקודות משתמש)
        if (wasCompleted) {
            await Book.findByIdAndUpdate(book._id, { $inc: { completedPages: -1 } });
        }

        // הוספת נקודות למשתמש
        await User.findByIdAndUpdate(userId, { $inc: { points: 5 } });

        return NextResponse.json({ success: true, page });

    } catch (error) {
        console.error("Claim Page Error:", error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
