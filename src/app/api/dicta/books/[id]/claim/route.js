import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import dbConnect from '@/lib/db' 
import DictaBook from '@/models/DictaBook'
import User from '@/models/User'
import { authOptions } from '@/app/api/auth/[...nextauth]/route' 
import { hasBooksAccess } from '@/lib/roles'

// שינינו את קבלת הפרמטרים
export async function POST(request, context) {
  // פותרים את ה-Promise של ה-params לפי הסטנדרט החדש של Next.js 15
  const params = await context.params;
  
  try {
    // 1. אימות המשתמש
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'אינך מורשה לבצע פעולה זו - חסר זיהוי משתמש' }, { status: 401 });
    }

    // עכשיו בטוח לגשת ל-ID
    const bookId = params.id;
    const userId = session.user.id;
    const userName = session.user.name || 'משתמש לא ידוע';

    // 2. חיבור למסד הנתונים
    await dbConnect();

    // 3. בדיקת סטטוס המשתמש (acceptReminders)
    const user = await User.findById(userId);
    if (!user || !user.acceptReminders) {
      return NextResponse.json({ 
        success: false, 
        error: 'TERMS_REQUIRED',
        redirectUrl: '/library/auth/approve-terms-on-edit'
      }, { status: 403 });
    }

    // 4. שליפת הספר
    const book = await DictaBook.findById(bookId);
    
    if (!book) {
      console.log('❌ Book not found in DB.');
      return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 });
    }


    
    // 4. בדיקה אם הספר כבר תפוס — אדמין/admin_books עוקף ויכול לתפוס בכל זאת
    const isAdmin = hasBooksAccess(session.user.role);
    const claimedByOther = book.claimedBy && book.claimedBy.toString() !== String(userId);
    const wasTakenOver = claimedByOther;

    if ((book.claimedBy || book.status !== 'available') && !isAdmin) {
      console.log('❌ Book is already claimed or not available.');
      return NextResponse.json({ error: 'הספר כבר תפוס על ידי משתמש אחר או שאינו זמין' }, { status: 400 });
    }

    // 5. עדכון נתוני התפיסה בספר
    console.log('4. Updating book fields...');
    book.claimedBy = userId;
    book.status = 'in-progress';
    book.claimedAt = new Date();

    // 6. הוספת הפעולה להיסטוריה
    book.history.push({
      description: wasTakenOver ? 'הספר נתפס לעריכה (השתלטות מנהל)' : 'הספר נתפס לעריכה',
      editorId: userId,
      editorName: userName,
      timestamp: new Date()
    });

    // 7. שמירה במסד הנתונים
    await book.save();

    // 8. הוספת 10 נקודות למשתמש על תפיסת הספר
    await User.findByIdAndUpdate(userId, { $inc: { points: 10 } });

    return NextResponse.json({ success: true, message: 'הספר נתפס בהצלחה' }, { status: 200 });

  } catch (error) {
    console.error('!!! ❌ ERROR IN CLAIM API ❌ !!!');
    console.error('Error message:', error.message);
    
    return NextResponse.json({ 
      error: 'שגיאת שרת פנימית', 
      details: error.message 
    }, { status: 500 });
  }
}