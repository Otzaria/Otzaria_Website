import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import dbConnect from '@/lib/db'
import DictaBook from '@/models/DictaBook'
import User from '@/models/User'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { hasBooksAccess } from '@/lib/roles'
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags'
import { unauthorized, forbidden, notFound, serverError } from '@/lib/apiResponse'

export async function POST(request, context) {

  try {
    // פותרים את ה-Promise של ה-params
    const params = await context.params;
    const bookId = params.id;

    // 1. אימות המשתמש
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return unauthorized('אינך מורשה לבצע פעולה זו - חסר זיהוי משתמש');
    }

    const userId = String(session.user.id); // ממירים למחרוזת ליתר ביטחון
    const userName = session.user.name || 'משתמש לא ידוע';
    const isAdmin = hasBooksAccess(session.user.role);
    

    // 2. חיבור למסד הנתונים
    await dbConnect();
    
    // 3. שליפת הספר
    const book = await DictaBook.findById(bookId);
    
    if (!book) {
      return notFound('הספר לא נמצא');
    }

    console.log('✅ Book found:', book.title);
    
    console.log('Current claimedBy in DB (raw):', book.claimedBy);
    
    const claimedByIdString = book.claimedBy ? book.claimedBy.toString() : null;
    console.log('ClaimedBy (Stringified):', claimedByIdString);
    console.log('Current User ID trying to release:', userId);

    // 4. בדיקת הרשאות
    const isOwner = claimedByIdString === userId;
    
    if (!isOwner && !isAdmin) {
      return forbidden('אינך מורשה לשחרר ספר זה');
    }

    // 5. איפוס נתוני התפיסה בספר
    console.log('5. Releasing book fields...');
    book.claimedBy = null;
    book.claimedAt = null;
    book.status = 'available';

    // 6. הוספת הפעולה להיסטוריה
    book.history.push({
      description: 'הספר שוחרר והוחזר למאגר העריכה',
      editorId: userId,
      editorName: userName,
      timestamp: new Date()
    });

    // 7. שמירה במסד הנתונים
    await book.save();

    // 8. הפחתת 10 נקודות מהמשתמש על שחרור הספר
    await User.findByIdAndUpdate(userId, { $inc: { points: -10 } });

    revalidateNow(CACHE_TAGS.DICTA_BOOKS_ADMIN_LIST);

    return NextResponse.json({ success: true, message: 'הספר שוחרר בהצלחה' }, { status: 200 });

  } catch (error) {
    console.error('!!! ❌ ERROR IN RELEASE API ❌ !!!');
    console.error('Error message:', error.message);
    console.error('Stack:', error.stack);

    return serverError('שגיאת שרת פנימית');
  }
}