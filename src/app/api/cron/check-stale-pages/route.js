import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
// רישום מודל Book ב-Mongoose עבור populate (ללא binding שמייצר אזהרת unused-import)
import '@/models/Book';
import User from '@/models/User';
import { sendStalePageReminder } from '@/lib/emailService';
import { releaseExpiredPageClaims } from '@/lib/bookPageClaims';
import { isPersonalBook, pageReleaseCutoff, pageRemindCutoff } from '@/lib/pageClaimPolicy';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
// הזמנים (שחרור אחרי 5 ימים בלי עריכה, תזכורת אחרי 3) — ב-pageClaimPolicy.js

function authorize(request) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET not configured' };

    const header = request.headers.get('authorization') || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!provided || provided !== secret) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }
    return { ok: true };
}

async function processStalePages(now) {
    const remindCutoff = pageRemindCutoff(now);
    const releaseCutoff = pageReleaseCutoff(now);

    let remindersSent = 0;

    // שחרור אוטומטי (קודם, כדי שלא נשלח גם תזכורת על אותו עמוד). ספרים אישיים לא משתחררים.
    const pagesReleased = await releaseExpiredPageClaims({ now });

    // תזכורת לעורך (אגרגציה לפי משתמש+ספר, מייל אחד פר משלוח)
    const stalePages = await Page.find({
        status: 'in-progress',
        claimedBy: { $ne: null },
        updatedAt: { $lte: remindCutoff, $gt: releaseCutoff },
        $or: [
            { lastAutoReminderAt: { $exists: false } },
            { lastAutoReminderAt: null },
            { $expr: { $lt: ['$lastAutoReminderAt', '$updatedAt'] } },
        ],
    }).populate('book', 'name slug isPrivate ownerId');

    // אגרגציה: userId -> bookId -> { user, book, pages, pageIds }
    const groups = new Map();
    for (const page of stalePages) {
        if (!page.book || isPersonalBook(page.book)) continue;
        if (!page.claimedBy) continue;

        const userKey = String(page.claimedBy);
        const bookKey = String(page.book._id);
        const groupKey = `${userKey}::${bookKey}`;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                userId: page.claimedBy,
                book: page.book,
                pages: [],
                pageIds: [],
            });
        }
        const group = groups.get(groupKey);
        const daysSinceEdit = Math.floor((now - new Date(page.updatedAt)) / DAY_MS);
        group.pages.push({ pageNumber: page.pageNumber, daysSinceEdit });
        group.pageIds.push(page._id);
    }

    for (const group of groups.values()) {
        const user = await User.findById(group.userId).select('email name acceptReminders isVerified');
        if (!user || !user.email || !user.acceptReminders || !user.isVerified) continue;

        group.pages.sort((a, b) => a.pageNumber - b.pageNumber);
        const result = await sendStalePageReminder({
            user,
            book: group.book,
            pages: group.pages,
        });

        if (result.sent) {
            remindersSent += 1;
            await Page.updateMany(
                { _id: { $in: group.pageIds } },
                { $set: { lastAutoReminderAt: now } },
                { timestamps: false }
            );
        }
    }

    return { remindersSent, pagesReleased };
}

async function runCheck(request) {
    const auth = authorize(request);
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    try {
        await connectDB();
        const now = new Date();

        const pagesResult = await processStalePages(now);

        return NextResponse.json({
            success: true,
            ranAt: now.toISOString(),
            pages: pagesResult,
        });
    } catch (error) {
        console.error('Stale-pages cron error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request) {
    return runCheck(request);
}

export async function GET(request) {
    return runCheck(request);
}
