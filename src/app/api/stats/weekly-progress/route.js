import { publicPagesStages } from '@/lib/privateBooks';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import { cached } from '@/lib/api-cache';
import { serverError } from '@/lib/apiResponse';

// הנתון הוא ספירת דפים לפי יום — אין טעם לחשב אותו מחדש לכל מבקר.
const CACHE_TTL_MS = 5 * 60_000;

async function computeWeeklyProgress() {
    await connectDB();

    // הטווח והכותרות משתמשים ב-UTC, כמו הקיבוץ של Mongo ומפתח המטמון.
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);

    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 6); // 7 ימים אחורה
    start.setUTCHours(0, 0, 0, 0);

    // שליפת הנתונים מהמסד (רק דפים שהושלמו בטווח הזמן).
    // ה-$match נשען על האינדקס {status: 1, completedAt: 1} שב-models/Page.js.
    const stats = await Page.aggregate([
        {
            $match: {
                status: 'completed',
                completedAt: { $gte: start, $lte: end }
            }
        },
        ...publicPagesStages(),
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
        d.setUTCDate(d.getUTCDate() + i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD

        const count = statsMap.get(dateStr) || 0;
        total += count;

        filledData.push({
            _id: dateStr,
            date: d.toLocaleDateString('he-IL', { weekday: 'short', timeZone: 'UTC' }),
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

        // נתון ציבורי-אגרגטיבי-לגמרי (ספירת דפים כללית, לא תלוי-session/הרשאה) —
        // מותר CDN/browser caching קצר, ראו הערה מקבילה ב-github-releases.
        return NextResponse.json(payload, {
            headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
        });
    } catch (error) {
        console.error('Weekly stats error:', error);
        return serverError();
    }
}
