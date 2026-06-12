import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

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