import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Category from '@/models/Category';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
export async function GET() {
  try {
    await connectDB();
    const categories = await Category.find({}).sort({ order: 1 });
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasBookLibraryAccess(session.user?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();
    const { categories } = await request.json();

    await Category.deleteMany({});
    
    if (categories && categories.length > 0) {
      await Category.insertMany(categories);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !hasBookLibraryAccess(session.user?.role)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const data = await request.json();
    const { bookId, name, category, isHidden } = data;

    await connectDB();
    
    // שליפת הספר הנוכחי מהמסד לבדיקה
    const book = await Book.findById(bookId);
    if (!book) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    const isPersonal = book.isPrivate || book.ownerId; // זיהוי ספר אישי
    
    if (isPersonal && category && category !== book.category) {
        return NextResponse.json({ 
            success: false, 
            error: 'לא ניתן לשנות קטגוריה לספר אישי' 
        }, { status: 403 });
    }

    // עדכון השדות (רק אם הם קיימים בבקשה)
    if (name) book.name = name;
    
    // עדכון קטגוריה רק אם זה לא ספר אישי
    if (category && !isPersonal) book.category = category;
    
    if (typeof isHidden !== 'undefined') book.isHidden = isHidden;

    await book.save();

    return NextResponse.json({ success: true, book });

  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}