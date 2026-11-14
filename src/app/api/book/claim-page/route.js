import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { unauthorized, notFound, serverError } from '@/lib/apiResponse';
import { claimBookPage } from '@/lib/bookPageClaims';

export async function POST(request) {
    try {
        // 1. אימות סשן
        const session = await getServerSession(authOptions);
        if (!session) {
            return unauthorized('Unauthorized');
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

        // 5. מציאת הספר
        const book = await Book.findOne({ slug: decodeURIComponent(bookPath) });
        if (!book) return notFound('Book not found');

        // 6. תפיסה: בעלות, מכסת 5 עמודים, ושחרור עצלן של תפיסה שפג תוקפה
        //    (bookPageClaims.js). אדמין/admin_books עוקף בעלות ומכסה.
        const isAdmin = hasBookLibraryAccess(session.user);
        const result = await claimBookPage({ userId, isAdmin, book, pageNumber: Number(pageNumber) });
        if (result.status !== 200) {
            return NextResponse.json(result.body, { status: result.status });
        }

        // 7. עדכונים רוחביים (מונה ספר ונקודות משתמש)
        if (result.wasCompleted) {
            await Book.findByIdAndUpdate(book._id, { $inc: { completedPages: -1 } });
        }

        // נקודות רק על תפיסה חדשה — לא על תפיסה חוזרת של עמוד שכבר שלך
        if (result.isNewClaim) {
            await User.findByIdAndUpdate(userId, { $inc: { points: 5 } });
        }

        return NextResponse.json(result.body);

    } catch (error) {
        console.error("Claim Page Error:", error);
        return serverError('Internal Server Error');
    }
}
