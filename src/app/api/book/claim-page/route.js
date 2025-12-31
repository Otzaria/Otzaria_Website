import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import User from '@/models/User';
import mongoose from 'mongoose';

export async function POST(request) {
    try {
        const { bookPath, pageNumber, userId } = await request.json();
        
        if (!userId) {
             return NextResponse.json({ success: false, error: 'User ID missing' }, { status: 450 });
        }

        await connectDB();

        const book = await Book.findOne({ slug: decodeURIComponent(bookPath) });
        if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

        const page = await Page.findOne({ book: book._id, pageNumber });
        if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

        // בדיקה אם כבר תפוס ע"י משתמש אחר
        if (page.status === 'in-progress' && page.claimedBy && page.claimedBy.toString() !== userId) {
             return NextResponse.json({ success: false, error: 'העמוד כבר בטיפול ע"י משתמש אחר' }, { status: 409 });
        }

        // עדכון סטטוס - המרה מפורשת ל-ObjectId
        page.status = 'in-progress';
        page.claimedBy = new mongoose.Types.ObjectId(userId);
        page.claimedAt = new Date();
        await page.save();

        // עדכון נקודות (אופציונלי)
        await User.findByIdAndUpdate(userId, { $inc: { points: 5 } });

        return NextResponse.json({ success: true, page });

    } catch (error) {
        console.error("Claim Page Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}