import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendBookNotification } from '@/lib/emailService';
import { hasBookLibraryAccess } from '@/lib/roles';

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    
    // בדיקת הרשאות מנהל
    if (!hasBookLibraryAccess(session?.user?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { bookId, name, category, author, description, isHidden, sendNotification } = await request.json();
    await connectDB();

    // שליפת הספר הנוכחי לבדיקת סטטוס לפני עדכון
    const currentBook = await Book.findById(bookId);
    
    if (!currentBook) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // בדיקה: האם הספר הוא אישי?
    // לפי המודל שלך, ספר אישי הוא כזה שיש לו ownerId (שויך למשתמש) או שדה isPrivate
    const isPersonalBook = currentBook.ownerId || currentBook.isPrivate;

    // חסימה: אם הספר אישי ומנסים להפוך אותו לגלוי (isHidden = false)
    if (isPersonalBook && isHidden === false) {
        return NextResponse.json({ 
            error: 'לא ניתן להפוך ספרים אישיים לגלויים' 
        }, { status: 400 });
    }

    // בדיקה ששם הספר לא תפוס ע"י ספר אחר
    if (name && name !== currentBook.name) {
        const existing = await Book.findOne({ name, _id: { $ne: bookId } });
        if (existing) {
            return NextResponse.json({ error: 'שם הספר כבר קיים במערכת' }, { status: 400 });
        }
    }

    const updatedBook = await Book.findByIdAndUpdate(
        bookId,
        { name, category, author, description, isHidden },
        { new: true }
    );

    if (!updatedBook) {
        return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    if (sendNotification && isHidden === false) {
        await sendBookNotification(updatedBook.name, updatedBook.slug);
    }

    return NextResponse.json({ success: true, book: updatedBook });

  } catch (error) {
    console.error('Update Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}