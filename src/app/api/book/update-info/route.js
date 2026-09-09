import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { requireAccess, notFound, serverError } from '@/lib/apiResponse';

export async function POST(request) {

  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const body = await request.json();
    const { bookId, editingInfo, examplePage } = body;

    await connectDB();

    const updateData = { editingInfo };
    
    if (examplePage !== undefined) {
        updateData.examplePage = examplePage;
    } else {
    }


    const book = await Book.findByIdAndUpdate(
        bookId,
        updateData,
        { returnDocument: 'after' }
    );

    if (!book) {
        console.log('❌ Book not found in DB with ID:', bookId);
        return notFound('Book not found');
    }

    return NextResponse.json({ success: true, message: 'המידע עודכן' });
  } catch (error) {
    console.error('🔥 API ERROR:', error);
    return serverError('Internal Server Error');
  }
}