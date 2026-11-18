import { hasPrivateOcrAccess } from '@/lib/roles';
import { requireAccess } from '@/lib/apiResponse';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { serverError } from '@/lib/apiResponse';

async function listPrivateBooks() {
  try {
    const session = await getServerSession(authOptions);

    const denied = requireAccess(session, hasPrivateOcrAccess);
    if (denied) return denied;

    await connectDB();

    const books = await Book.find({ ownerId: session.user._id || session.user.id, isPrivate: true })
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
      privateOcr: book.privateOcr === true,
      thumbnail: null
    }));

    return NextResponse.json({ success: true, books: formattedBooks }, { headers: { 'Cache-Control': 'private, no-store' } });

  } catch (error) {
    console.error('Error fetching user books:', error);
    return serverError('Internal Server Error');
  }
}


export async function GET(request) {
  const response = await listPrivateBooks(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
