import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendBookNotification } from '@/lib/emailService';
import { hasBookLibraryAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);

    // בדיקת הרשאות מנהל
    const denied = requireAccess(session, hasBookLibraryAccess);
    if (denied) return denied;

    const { bookId, name, category, author, description, isHidden, sendNotification } = await request.json();
    await connectDB();

    // שליפת הספר הנוכחי לבדיקת סטטוס לפני עדכון
    const currentBook = await Book.findById(bookId);

    if (!currentBook) {
        return notFound('Book not found');
    }

    // בדיקה: האם הספר הוא אישי?
    // לפי המודל שלך, ספר אישי הוא כזה שיש לו ownerId (שויך למשתמש) או שדה isPrivate
    const isPersonalBook = currentBook.ownerId || currentBook.isPrivate;

    // חסימה: אם הספר אישי ומנסים להפוך אותו לגלוי (isHidden = false)
    if (isPersonalBook && isHidden === false) {
        return badRequest('לא ניתן להפוך ספרים אישיים לגלויים');
    }

    // בדיקה ששם הספר לא תפוס ע"י ספר אחר
    if (name && name !== currentBook.name) {
        const existing = await Book.findOne({ name, _id: { $ne: bookId } });
        if (existing) {
            return badRequest('שם הספר כבר קיים במערכת');
        }
    }

    const updatedBook = await Book.findByIdAndUpdate(
        bookId,
        { name, category, author, description, isHidden },
        { returnDocument: 'after' }
    );

    if (!updatedBook) {
        return notFound('Book not found');
    }

    if (sendNotification && isHidden === false) {
        await sendBookNotification(updatedBook.name, updatedBook.slug);
    }

    revalidateNow(CACHE_TAGS.BOOKS_ADMIN_LIST);

    return NextResponse.json({ success: true, book: updatedBook });

  } catch (error) {
    console.error('Update Error:', error);
    return serverError('Internal Server Error');
  }
}