import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import { cached, shabbatGatedCacheHeaders } from '@/lib/api-cache';

// הנתון הוא ספירת דפים לפי יום — אין טעם לחשב אותו מחדש לכל מבקר.
const CACHE_TTL_MS = 5 * 60_000;

async function computeWeeklyProgress() {
    await connectDB();

    // קביעת טווח תאריכים: 7 הימים האחרונים (כולל היום)
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setDate(start.getDate() - 6); // 7 ימים אחורה
    start.setHours(0, 0, 0, 0);

    // שליפת הנתונים מהמסד (רק דפים שהושלמו בטווח הזמן).
    // ה-$match נשען על האינדקס {status: 1, completedAt: 1} שב-models/Page.js.
    const stats = await Page.aggregate([
        {
            $match: {
                status: 'completed',
                completedAt: { $gte: start, $lte: end }
            }
        },
        {
            $group: {
                // המרה למחרוזת תאריך YYYY-MM-DD
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$completedAt" } },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // המרה למפה (Map) לגישה מהירה לפי תאריך
    const statsMap = new Map();
    stats.forEach(item => statsMap.set(item._id, item.count));

    // בניית המערך המלא (כולל ימים עם 0 פעילות)
    const filledData = [];
    let total = 0;

    for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD

        const count = statsMap.get(dateStr) || 0;
        total += count;

        filledData.push({
            _id: dateStr,
            date: d.toLocaleDateString('he-IL', { weekday: 'short'}),
            count: count
        });
    }

    return { success: true, data: filledData, total };
}

export async function GET() {
    try {
        // המפתח כולל את התאריך כדי שהמטמון יתחלף בחצות ולא יחזיק חלון ימים ישן.
        const dayKey = new Date().toISOString().slice(0, 10);
        const payload = await cached(`weekly-progress:${dayKey}`, CACHE_TTL_MS, computeWeeklyProgress);

        return NextResponse.json(payload, { headers: shabbatGatedCacheHeaders() });
    } catch (error) {
        console.error('Weekly stats error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
