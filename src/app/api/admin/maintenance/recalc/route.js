import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!hasBooksAccess(session?.user?.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await connectDB();

        // 1. שליפת כל הספרים
        const books = await Book.find({});
        let updatedCount = 0;
        const updatesLog = [];

        for (const book of books) {
            // ספירה אגרגטיבית לכל ספר (יעיל יותר משתי שליפות נפרדות)
            const stats = await Page.aggregate([
                { $match: { book: book._id } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        completed: { 
                            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } 
                        }
                    }
                }
            ]);

            const actualTotal = stats[0]?.total || 0;
            const actualCompleted = stats[0]?.completed || 0;

            // בדיקה האם נדרש עדכון
            if (book.totalPages !== actualTotal || book.completedPages !== actualCompleted) {
                
                await Book.findByIdAndUpdate(book._id, {
                    totalPages: actualTotal,
                    completedPages: actualCompleted
                });

                updatedCount++;
                updatesLog.push({
                    book: book.name,
                    before: { total: book.totalPages, completed: book.completedPages },
                    after: { total: actualTotal, completed: actualCompleted }
                });
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: `תהליך הסנכרון הסתיים. עודכנו ${updatedCount} ספרים.`,
            details: updatesLog
        });

    } catch (error) {
        console.error('Recalc Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}