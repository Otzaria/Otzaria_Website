import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import User from '@/models/User';
import DictaBook from '@/models/DictaBook';
import { cached, publicCacheHeaders } from '@/lib/api-cache';

// מספרי הכותרת בדף הבית. אין סיבה להריץ את הספירות בכל ביקור.
const CACHE_TTL_MS = 5 * 60_000;

async function computeStats() {
    await connectDB();

    const [usersCount, booksCount, pagesStats, dictaBooksCount] = await Promise.all([
        User.countDocuments(),

        Book.countDocuments({
            isHidden: { $ne: true },
            $or: [
                { ownerId: { $exists: false } },
                { ownerId: null }
            ],
            isPrivate: { $ne: true }
        }),

        // סדר השלבים חשוב: קודם מסננים לפי status (אינדקס) ורק אחר כך מצרפים את
        // הספר. בגרסה הקודמת ה-$lookup רץ על *כל* מסמכי העמודים בקולקציה, לפני
        // כל צמצום, וה-join כלל את מסמך הספר המלא.
        Page.aggregate([
            { $match: { status: 'completed' } },
            {
                $lookup: {
                    from: 'books',
                    localField: 'book',
                    foreignField: '_id',
                    as: 'hiddenBook',
                    // מצרפים רק ספרים *מוסתרים*, ורק את ה-_id. כך התנאי למטה
                    // שקול בדיוק ל-'bookData.isHidden': {$ne: true} המקורי, כולל
                    // ההתנהגות לעמוד שהספר שלו נמחק (נספר גם קודם).
                    pipeline: [
                        { $match: { isHidden: true } },
                        { $project: { _id: 1 } }
                    ]
                }
            },
            { $match: { 'hiddenBook.0': { $exists: false } } },
            {
                $group: {
                    _id: null,
                    completedPages: { $sum: 1 }
                }
            }
        ]),

        DictaBook.countDocuments({ status: 'completed' })
    ]);

    // המדידה נשארת כשהייתה: נספרים דפים שהושלמו בספרים שאינם מוסתרים. מכיוון
    // שהשאילתה מסננת status: 'completed', גם קודם totalPages היה שווה
    // ל-completedPages, inProgressPages היה 0 ו-completionRate היה 100.
    // הצרכן היחיד (StatsSection) מציג את totalPages בתווית "עמודים הושלמו".
    const completedPages = pagesStats[0]?.completedPages ?? 0;

    return {
        success: true,
        stats: {
            users: { total: usersCount },
            books: { total: booksCount },
            totalPages: completedPages,
            completedPages,
            inProgressPages: 0,
            completionRate: completedPages > 0 ? 100 : 0,
            dictaBooks: { completed: dictaBooksCount }
        }
    };
}

export async function GET() {
  try {
    const payload = await cached('site-stats', CACHE_TTL_MS, computeStats);
    return NextResponse.json(payload, { headers: publicCacheHeaders(300) });
  } catch (error) {
    console.error('Stats API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
