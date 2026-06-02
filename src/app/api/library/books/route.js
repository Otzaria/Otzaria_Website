import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import LibraryBook from '@/models/LibraryBook';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// רשימת הספרים במרחב העריכה (ללא תוכן — מטא בלבד)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const books = await LibraryBook.find(
      { removedUpstream: { $ne: true } },
      'path title category syncStatus pendingCount version updatedAt'
    )
      .sort({ category: 1, title: 1 })
      .lean();

    return NextResponse.json(books);
  } catch (error) {
    console.error('Failed to fetch library books:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
