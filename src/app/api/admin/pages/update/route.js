import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book'; // ייבוא המודל
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasBooksAccess(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { bookName, pageNumber, updates } = await request.json();
  
  await connectDB();

  // מציאת הספר לפי השם כדי להגיע ל-ID
  const book = await Book.findOne({ name: bookName });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const page = await Page.findOneAndUpdate(
      { book: book._id, pageNumber },
      updates, // { status: 'available', claimedBy: null... }
      { returnDocument: 'after' }
  );

  return NextResponse.json({ success: true, page });
}