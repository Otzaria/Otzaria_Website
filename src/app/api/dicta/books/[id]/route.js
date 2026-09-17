import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DictaBook from '@/models/DictaBook';
import UploadEditCopy from '@/models/UploadEditCopy';
import Upload from '@/models/Upload';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { requireBooksAccessOrForbidden } from '../../_auth';
import { unauthorized, forbidden, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorized('Unauthorized');
    }

    const userId = session.user._id || session.user.id;
    const isAdmin = hasBooksAccess(session.user.role);

    await connectDB();
    const { id } = await params;
    
    // ניסיון למצוא ב-DictaBook
    let book = await DictaBook.findById(id).populate('claimedBy', 'name');
    let isEditCopy = false;
    
    // אם לא נמצא, ננסה ב-UploadEditCopy
    if (!book) {
      book = await UploadEditCopy.findById(id).populate('claimedBy', 'name').populate('createdBy', 'name');
      isEditCopy = true;
    }
    
    if (!book) {
      return notFound('Book not found');
    }

    // עותקי עריכה נגישים רק לאדמין
    if (isEditCopy && !isAdmin) {
      return forbidden('Forbidden: Admin access required for edit copies');
    }

    // Check access: available books are accessible by all, in-progress only by owner or admin
    if (book.status === 'in-progress') {
      const isOwner = book.claimedBy?._id?.toString() === userId;
      if (!isAdmin && !isOwner) {
        return forbidden('Forbidden: This book is being edited by another user');
      }
    }

    // Return book data directly from MongoDB (no temp file needed)
    const bookData = book.toObject();
    bookData.isEditCopy = isEditCopy; // סימון שזה עותק עריכה
    return NextResponse.json(bookData);
  } catch (error) {
    console.error('Failed to fetch book:', error);
    return serverError('Internal Server Error');
  }
}

export async function PUT(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return unauthorized('Unauthorized');
    }

    const userId = session.user._id || session.user.id;
    if (!userId) {
      return unauthorized('Unauthorized: User ID missing');
    }
    const isAdmin = hasBooksAccess(session.user.role);

    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const { content, action, status } = body;

    // ניסיון למצוא ב-DictaBook
    let book = await DictaBook.findById(id);
    let isEditCopy = false;
    
    // אם לא נמצא, ננסה ב-UploadEditCopy
    if (!book) {
      book = await UploadEditCopy.findById(id);
      isEditCopy = true;
    }
    
    if (!book) {
      return notFound('Book not found');
    }

    // עותקי עריכה - רק אדמין יכול לערוך
    if (isEditCopy && !isAdmin) {
      return forbidden('Forbidden: Admin access required for edit copies');
    }

    // פעולת תפיסה (Claim) - תמיד מותר אם הספר פנוי
    if (action === 'claim') {
      if (book.status !== 'available') {
        return badRequest('Book already claimed');
      }
      book.status = 'in-progress';
      book.claimedBy = userId;
      book.claimedAt = new Date();
      await book.save();
      if (!isEditCopy) revalidateNow(CACHE_TAGS.DICTA_BOOKS_ADMIN_LIST);
      return NextResponse.json({ success: true, message: 'Book claimed' });
    }

    // עדכון סטטוס ישיר (אדמין בלבד)
    if (status !== undefined) {
      if (!isAdmin) {
        return forbidden('Forbidden: Admin access required');
      }
      book.status = status;
      if (status === 'available') {
        book.claimedBy = null;
        book.claimedAt = null;
      } else if (status === 'completed') {
        book.completedAt = new Date();
      }
      await book.save();
      if (!isEditCopy) revalidateNow(CACHE_TAGS.DICTA_BOOKS_ADMIN_LIST);
      return NextResponse.json({ success: true, book });
    }

    // בדיקת הרשאה לפעולות עריכה/ניהול
    const isOwner = book.claimedBy?.toString() === userId;

    // חסימת שמירה אם המשתמש אינו אדמין ואינו התופס (לא רלוונטי לעותקי עריכה)
    if (content !== undefined) {
      if (!isEditCopy && !isAdmin && !isOwner) {
        return forbidden('כדי לערוך יש לתפוס את הספר לעריכה');
      }
      book.content = content;
      
      // הוספה להיסטוריה אם זה עותק עריכה
      if (isEditCopy) {
        book.history.push({
          timestamp: new Date(),
          description: 'עדכון תוכן',
          editorId: userId,
          editorName: session.user.name,
        });
      }
    }

    // בדיקת הרשאה לשחרור, סיום או ביטול סיום
    if (action === 'release' || action === 'complete' || action === 'uncomplete') {
      if (!isAdmin && !isOwner) {
        return forbidden('Forbidden');
      }
      
      if (action === 'release') {
        book.status = 'available';
        book.claimedBy = null;
        book.claimedAt = null;
        // הפחתת 10 נקודות על שחרור הספר
        await User.findByIdAndUpdate(userId, { $inc: { points: -10 } });
      } else if (action === 'complete') {
        const wasCompleted = book.status === 'completed';
        book.status = 'completed';
        book.completedAt = new Date();
        // הוספת 20 נקודות רק אם הספר לא היה מושלם קודם
        if (!wasCompleted) {
          const userIdToReward = book.claimedBy || userId;
          await User.findByIdAndUpdate(userIdToReward, { $inc: { points: 20 } });
        }
      } else if (action === 'uncomplete') {
        const wasCompleted = book.status === 'completed';
        book.status = 'in-progress';
        book.completedAt = undefined;
        // הפחתת 20 נקודות אם הספר היה מושלם
        if (wasCompleted) {
          const userIdToPenalize = book.claimedBy || userId;
          await User.findByIdAndUpdate(userIdToPenalize, { $inc: { points: -20 } });
        }
      }
    }
    
    await book.save();
    if (!isEditCopy) revalidateNow(CACHE_TAGS.DICTA_BOOKS_ADMIN_LIST);
    return NextResponse.json(book);
  } catch (error) {
    console.error('Failed to update book:', error);
    return serverError('Internal Server Error');
  }
}

export async function DELETE(req, { params }) {
  try {
    const auth = await requireBooksAccessOrForbidden();
    if (!auth.ok) return auth.response;

    await connectDB();
    const { id } = await params;
    
    // ניסיון למצוא ב-DictaBook
    let book = await DictaBook.findById(id);
    let isEditCopy = false;
    
    // אם לא נמצא, ננסה ב-UploadEditCopy
    if (!book) {
      book = await UploadEditCopy.findById(id);
      isEditCopy = true;
    }
    
    if (!book) {
      return notFound('Book not found');
    }

    // אם זה עותק עריכה, נעדכן את ההעלאות המקוריות
    if (isEditCopy) {
      // הסרת הקישור לעותק העריכה מההעלאות המקוריות
      if (book.sourceUploadIds && book.sourceUploadIds.length > 0) {
        await Upload.updateMany(
          { _id: { $in: book.sourceUploadIds } },
          { 
            $unset: { 
              editCopy: "",
              editCopyCreatedAt: ""
            }
          }
        );
      }
      
      // מחיקת עותק העריכה
      await UploadEditCopy.findByIdAndDelete(id);
    } else {
      // מחיקת ספר דיקטה רגיל
      await DictaBook.findByIdAndDelete(id);
      revalidateNow(CACHE_TAGS.DICTA_BOOKS_ADMIN_LIST);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete book:', error);
    return serverError('Internal Server Error');
  }
}
