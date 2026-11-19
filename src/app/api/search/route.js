import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { apiError, serverError } from '@/lib/apiResponse';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');

        // בקשות ריקות/קצרות אינן צורכות מכסה ואינן ניגשות ל-DB
        if (!query || query.trim().length < 2) {
            return NextResponse.json({ results: [] });
        }

        // הגבלת קצב רק על חיפושים אמיתיים — IP אמין דרך src/lib/client-ip.js
        const ip = getClientIp(request);
        if (!checkRateLimit(ip, 'search', 30, 'minute')) {
            return apiError(429, 'יותר מדי בקשות חיפוש. נסה שוב בעוד רגע.');
        }

        await connectDB();

        // מסננים ספרים מוסתרים ואישיים לפני ההגבלה, כדי שעמודים פרטיים לא יתפסו
        // מקום בתוצאות הפומביות. השיוך לספר משתמש באינדקס _id.
        const pages = await Page.aggregate([
            { $match: { $text: { $search: query } } },
            { $project: { book: 1, pageNumber: 1, content: 1, rightColumn: 1, leftColumn: 1, score: { $meta: 'textScore' } } },
            { $lookup: {
                from: Book.collection.name,
                localField: 'book',
                foreignField: '_id',
                pipeline: [
                    { $match: { isHidden: { $ne: true }, isPrivate: { $ne: true }, ownerId: null } },
                    { $project: { _id: 0, name: 1, slug: 1 } },
                ],
                as: 'book',
            } },
            { $unwind: '$book' },
            { $sort: { score: -1 } },
            { $limit: 50 },
        ]);

        const results = pages.map(page => {
            // איחוד התוכן לטקסט אחד לחיפוש הסניפט
            const fullText = page.content || `${page.rightColumn} ${page.leftColumn}`;
            
            return {
                id: page._id,
                bookName: page.book?.name || 'ספר לא ידוע',
                bookSlug: page.book?.slug,
                pageNumber: page.pageNumber,
                snippet: getSnippet(fullText, query),
                score: page.score
            };
        });

        return NextResponse.json({ success: true, results });
    } catch (error) {
        return serverError();
    }
}

// פונקציית עזר משופרת לחיתוך טקסט
function getSnippet(text, query) {
    if (!text) return '';
    
    // ניקוי ביטוי החיפוש לשימוש ב-Regex
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // חיפוש המילה כחלק ממשפט (Case insensitive)
    const regex = new RegExp(safeQuery, 'i');
    
    const match = text.match(regex);
    if (!match) return text.substring(0, 100) + '...';
    
    const index = match.index;
    const padding = 60; // מספר תווים לפני ואחרי
    
    // חישוב גבולות החיתוך
    let start = Math.max(0, index - padding);
    let end = Math.min(text.length, index + query.length + padding);
    
    // ניסיון לחתוך ברווח הקרוב כדי לא לשבור מילים
    if (start > 0) {
        const spaceBefore = text.lastIndexOf(' ', start + 10);
        if (spaceBefore > start - 10) start = spaceBefore + 1;
    }
    
    if (end < text.length) {
        const spaceAfter = text.indexOf(' ', end - 10);
        if (spaceAfter > -1 && spaceAfter < end + 10) end = spaceAfter;
    }

    let snippet = text.substring(start, end);
    
    // הוספת שלוש נקודות אם נחתך
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    
    // הדגשת מילת החיפוש (אופציונלי - ה-Frontend יכול לעשות זאת גם)
    snippet = snippet.replace(regex, (match) => `<mark>${match}</mark>`);

    return snippet;
}