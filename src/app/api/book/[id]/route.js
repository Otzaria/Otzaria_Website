import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { unauthorized, forbidden, notFound, serverError } from '@/lib/apiResponse';

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return unauthorized('Unauthorized');
    }
    
    const userId = session.user.id || session.user._id;
    const isAdmin = hasBookLibraryAccess(session?.user?.role);
    
    await connectDB();
    
    const { id } = await params;
    const identifier = decodeURIComponent(id);

    const book = await Book.findOne({ 
        $or: [
            { slug: identifier }, 
            { name: identifier }
        ] 
    }).lean();
    
    if (!book) {
      return notFound('הספר לא נמצא');
    }

    const isOwner = book.ownerId && (book.ownerId.toString() === userId.toString());

    const isRestricted = book.isHidden || book.isPrivate;

    if (isRestricted && !isAdmin && !isOwner) {
      return forbidden('אין הרשאות לצפייה בספר זה');
    }

    // ?page=N — העורך (/library/books/[path]/[n]) צריך רק את העמוד שלו; בלי
    // הפרמטר נשלחים כל העמודים (דף הספר), כבעבר. אותו מבנה תגובה בשני המקרים.
    const pageParam = new URL(request.url).searchParams.get('page');
    const onlyPage = pageParam !== null && /^\d+$/.test(pageParam) ? Number(pageParam) : null;
    const pagesQuery = onlyPage === null ? { book: book._id } : { book: book._id, pageNumber: onlyPage };

    const pages = await Page.find(pagesQuery)
      .sort({ pageNumber: 1 })
      .select('pageNumber status imagePath claimedBy claimedAt completedAt') 
      .populate('claimedBy', 'name email') 
      .lean();

    const formattedPages = pages.map(p => ({
      id: p._id,
      number: p.pageNumber,
      status: p.status,
      thumbnail: p.imagePath, 
      claimedBy: p.claimedBy ? p.claimedBy.name : null,
      claimedById: p.claimedBy ? p.claimedBy._id : null,
      claimedAt: p.claimedAt,
      completedAt: p.completedAt
    }));

    return NextResponse.json({
      success: true,
      book: {
        id: book._id,
        name: book.name,
        slug: book.slug, 
        path: book.slug,
        totalPages: book.totalPages,
        completedPages: book.completedPages,
        category: book.category,
        description: book.description,
        editingInfo: book.editingInfo || null,
        examplePage: book.examplePage || null,
        isPrivate: book.isPrivate || false,
        isOwner: isOwner
      },
      pages: formattedPages
    });

  } catch (error) {
    console.error('Get Book Error:', error);
    return serverError('שגיאה בטעינת הספר');
  }
}