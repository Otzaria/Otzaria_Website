import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const books = await Book.find({ ownerId: session.user.id })
      .sort({ createdAt: -1 })
      .lean();

    const formattedBooks = books.map(book => ({
      id: book._id.toString(),
      name: book.name,
      path: book.slug,
      category: book.category || 'אישי',
      totalPages: book.totalPages,
      completedPages: book.completedPages || 0,
      inProgressPages: book.totalPages - (book.completedPages || 0),
      status: book.completedPages === book.totalPages ? 'completed' : 'in-progress',
      isHidden: book.isHidden,
      thumbnail: book.coverImage || null 
    }));

    return NextResponse.json({ success: true, books: formattedBooks });

  } catch (error) {
    console.error('Error fetching user books:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}