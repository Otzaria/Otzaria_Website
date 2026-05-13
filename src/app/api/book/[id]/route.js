import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userId = session.user.id || session.user._id;
    const isAdmin = hasBooksAccess(session?.user?.role);
    
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
      return NextResponse.json({ success: false, error: 'הספר לא נמצא' }, { status: 404 });
    }

    const isOwner = book.ownerId && (book.ownerId.toString() === userId.toString());
    
    const isRestricted = book.isHidden || book.isPrivate;

    if (isRestricted && !isAdmin && !isOwner) {
      return NextResponse.json({ success: false, error: 'אין הרשאות לצפייה בספר זה' }, { status: 403 });
    }

    const pages = await Page.find({ book: book._id })
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
    return NextResponse.json({ success: false, error: 'שגיאה בטעינת הספר' }, { status: 500 });
  }
}