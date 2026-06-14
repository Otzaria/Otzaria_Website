import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function GET(request, { params }) {
    const session = await getServerSession(authOptions);
    if (!hasBooksAccess(session?.user?.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    try {
        const { id } = await params;
        await connectDB();

        const page = await Page.findById(id).populate('book');

        if (!page) {
            return NextResponse.json({ error: 'Page not found' }, { status: 404 });
        }

        let textContent = '';
        if (page.isTwoColumns) {
            textContent = `--- ${page.rightColumnName} ---\n${page.rightColumn || ''}\n\n--- ${page.leftColumnName} ---\n${page.leftColumn || ''}`;
        } else {
            textContent = page.content || '';
        }

        const bookName = page.book ? (page.book.name || page.book.title || 'book') : 'unknown';

        const filename = `${bookName}-page-${page.pageNumber}.txt`;

        return new NextResponse(textContent, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`
            }
        });

    } catch (error) {
        console.error('Download error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}