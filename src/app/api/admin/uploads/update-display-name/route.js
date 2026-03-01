import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import UploadedBook from '@/models/UploadedBook';

// PUT - עדכון שם תצוגה של ספר
export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { bookId, displayName } = await request.json();
    
    if (!bookId || !displayName) {
      return NextResponse.json({ error: 'Book ID and display name are required' }, { status: 400 });
    }

    await connectDB();
    
    const result = await UploadedBook.findByIdAndUpdate(
      bookId,
      { displayName: displayName.trim() },
      { new: true }
    );
    
    if (!result) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      book: {
        id: result._id,
        title: result.title,
        displayName: result.displayName
      }
    });
  } catch (error) {
    console.error('Error updating display name:', error);
    return NextResponse.json({ error: 'Failed to update display name' }, { status: 500 });
  }
}
