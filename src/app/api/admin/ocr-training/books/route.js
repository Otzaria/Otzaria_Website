import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { isAdmin } from '@/lib/roles';

// GET: כל הספרים לבורר ההוספה — כולל מוסתרים. מחזיר totalPages כדי להגביל את מספר העמוד.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await connectDB();
    const books = await Book.find({}, 'name slug totalPages isHidden category')
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      books: books.map((b) => ({
        id: String(b._id),
        name: b.name,
        slug: b.slug,
        totalPages: b.totalPages || 0,
        isHidden: !!b.isHidden,
        category: b.category || '',
      })),
    });
  } catch (error) {
    console.error('OCR training books error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
