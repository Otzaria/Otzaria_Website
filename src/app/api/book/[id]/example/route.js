import { PUBLIC_BOOK_FILTER } from '@/lib/privateBooks';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { notFound, serverError } from '@/lib/apiResponse';

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    await connectDB();

    const { id } = await params;
    const decodedId = decodeURIComponent(id);

    const book = await Book.findOne({
        ...(hasBookLibraryAccess(session?.user) ? {} : PUBLIC_BOOK_FILTER),
        $or: [{ slug: decodedId }, { name: decodedId }]
    }).lean();

    if (!book) {
      return notFound('הספר לא נמצא');
    }

    if (!book.examplePage) {
        return notFound('לא הוגדר עמוד דוגמא לספר זה');
    }

    const page = await Page.findOne({
        book: book._id,
        pageNumber: book.examplePage
    }).lean();

    if (!page) {
        return notFound('עמוד הדוגמא לא נמצא במערכת');
    }

    const contentData = {
        content: page.content || '',
        leftColumn: page.leftColumn || '',
        rightColumn: page.rightColumn || '',
        twoColumns: page.twoColumns || (!!page.rightColumn || !!page.leftColumn),
        rightColumnName: page.rightColumnName || 'חלק 1',
        leftColumnName: page.leftColumnName || 'חלק 2'
    };

    return NextResponse.json({
      success: true,
      bookName: book.name,
      pageNumber: book.examplePage,
      image: page.imagePath || page.thumbnail, 
      text: contentData
    }, { headers: { 'Cache-Control': 'private, no-store' } });

  } catch (error) {
    console.error('Error fetching example page:', error);
    return serverError('שגיאה בשרת');
  }
}
