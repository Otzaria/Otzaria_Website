import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { isUserId } from '@/lib/adminPagesScreen/pagesQuery';
import { PAGE_DOWNLOAD_BATCH_SIZE } from '@/lib/adminPagesScreen/pageTerms';
import { formatPageText, PAGE_TEXT_FIELDS } from '@/lib/adminPagesScreen/pageRecords';

export async function GET(request) {
    const session = await getServerSession(authOptions);
    if (!hasBooksAccess(session?.user?.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    try {
        await connectDB();

        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const bookName = searchParams.get('book');
        const userId = searchParams.get('userId');

        let query = {};

        if (status) query.status = status;
        if (userId) query.claimedBy = userId;

        if (bookName) {
            const bookDoc = await Book.findOne({ name: bookName });
            if (bookDoc) {
                query.book = bookDoc._id;
            } else {
                return new NextResponse('', { status: 200 });
            }
        }

        const pages = await Page.find(query)
            .populate('book')
            .sort({ book: 1, pageNumber: 1 });

        let fullContent = "";

        for (const page of pages) {
            const currentBookName = page.book?.name || page.book?.title || 'Unknown Book';
            fullContent += `========================================\n`;
            fullContent += `ספר: ${currentBookName} | עמוד: ${page.pageNumber}\n`;
            fullContent += `========================================\n\n`;

            if (page.isTwoColumns) {
                fullContent += `--- ${page.rightColumnName} ---\n${page.rightColumn || ''}\n\n`;
                fullContent += `--- ${page.leftColumnName} ---\n${page.leftColumn || ''}\n`;
            } else {
                fullContent += (page.content || '') + "\n";
            }

            fullContent += "\n\n";
        }

        const filename = `all-pages-export-${Date.now()}.txt`;

        return new NextResponse(fullContent, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
            }
        });

    } catch (error) {
        console.error('Batch download error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
// Selected-page export uses IDs and returns structured text, including embedded
// separators and trailing whitespace, for both single-column and two-column pages.
export async function POST(request) {
    const session = await getServerSession(authOptions);
    if (!hasBooksAccess(session?.user?.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    try {
        const { ids } = await request.json().catch(() => ({})) ?? {};
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > PAGE_DOWNLOAD_BATCH_SIZE || !ids.every((id) => typeof id === 'string' && isUserId(id))) {
            return NextResponse.json({ error: 'Invalid page IDs' }, { status: 400 });
        }
        await connectDB();
        const pages = await Page.find({ _id: { $in: ids } }).select(PAGE_TEXT_FIELDS).lean();
        return NextResponse.json({ pages: pages.map((page) => ({ id: String(page._id), text: formatPageText(page) })) });
    } catch (error) {
        console.error('Selected page download error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
