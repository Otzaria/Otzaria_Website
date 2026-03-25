import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DictaBook from '@/models/DictaBook';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function GET() {
  try {
    // בדיקת התחברות
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    // שליפת רשימת הספרים כולל סטטוס ומי תפס
    const books = await DictaBook.find({}, 'title status claimedBy claimedAt updatedAt')
      .populate('claimedBy', 'name')
      .sort({ updatedAt: -1 });
    return NextResponse.json(books);
  } catch (error) {
    console.error('Failed to fetch books:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// יצירת ספר חדש - רק למנהלים!
export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    await connectDB();
    const body = await req.json();
    const { title, content } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const newBook = await DictaBook.create({
      title,
      content: content || "",
      status: 'available',
    });

    return NextResponse.json(newBook, { status: 201 });
  } catch (error) {
    console.error('Failed to create book:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
