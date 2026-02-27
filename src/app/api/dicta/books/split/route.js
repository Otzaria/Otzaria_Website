import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DictaBook from '@/models/DictaBook';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(request) {
  const session = await getServerSession(authOptions);
  
  try {
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectDB();

    const body = await request.json();
    const { bookId, splitPosition, firstBookTitle, secondBookTitle } = body;

    if (!bookId || !splitPosition || !firstBookTitle || !secondBookTitle) {
      return NextResponse.json({ 
        error: 'חסרים פרמטרים: יש לספק מזהה ספר, מיקום פיצול ושמות לשני הספרים' 
      }, { status: 400 });
    }

    // טעינת הספר המקורי
    const originalBook = await DictaBook.findById(bookId);
    if (!originalBook) {
      return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 });
    }

    const content = originalBook.content || '';
    
    // וידוא שמיקום הפיצול תקין
    if (splitPosition < 0 || splitPosition > content.length) {
      return NextResponse.json({ 
        error: 'מיקום הפיצול לא תקין' 
      }, { status: 400 });
    }

    // פיצול התוכן
    const firstContent = content.substring(0, splitPosition).trim();
    const secondContent = content.substring(splitPosition).trim();

    if (!firstContent || !secondContent) {
      return NextResponse.json({ 
        error: 'אחד מהספרים יהיה ריק. אנא בחר מיקום פיצול אחר' 
      }, { status: 400 });
    }

    // בדיקה שהשמות לא קיימים
    const existingFirst = await DictaBook.findOne({ title: firstBookTitle });
    const existingSecond = await DictaBook.findOne({ title: secondBookTitle });
    
    if (existingFirst) {
      return NextResponse.json({ 
        error: `שם הספר הראשון "${firstBookTitle}" כבר קיים במערכת` 
      }, { status: 400 });
    }
    
    if (existingSecond) {
      return NextResponse.json({ 
        error: `שם הספר השני "${secondBookTitle}" כבר קיים במערכת` 
      }, { status: 400 });
    }

    // גישה חלופית ללא טרנזקציות - עם rollback ידני במקרה של כשל
    let firstBook = null;
    let secondBook = null;
    let originalDeleted = false;

    try {
      // שלב 1: יצירת הספר הראשון
      firstBook = await DictaBook.create({
        title: firstBookTitle,
        content: firstContent,
        status: originalBook.status,
        claimedBy: originalBook.claimedBy,
        claimedAt: originalBook.claimedAt,
        history: [{
          timestamp: new Date(),
          description: `נוצר מפיצול של "${originalBook.title}" (חלק ראשון)`,
          editorId: session.user._id || session.user.id,
          editorName: session.user.name
        }]
      });

      console.log('First book created:', firstBook._id);

      // שלב 2: יצירת הספר השני
      secondBook = await DictaBook.create({
        title: secondBookTitle,
        content: secondContent,
        status: 'available',
        history: [{
          timestamp: new Date(),
          description: `נוצר מפיצול של "${originalBook.title}" (חלק שני)`,
          editorId: session.user._id || session.user.id,
          editorName: session.user.name
        }]
      });

      console.log('Second book created:', secondBook._id);

      // שלב 3: מחיקת הספר המקורי
      await DictaBook.findByIdAndDelete(bookId);
      originalDeleted = true;

      console.log('Original book deleted:', bookId);
      console.log('Book split completed successfully');

      return NextResponse.json({ 
        success: true, 
        firstBookId: firstBook._id,
        secondBookId: secondBook._id,
        message: `הספר פוצל בהצלחה ל-2 ספרים חדשים`
      });

    } catch (operationError) {
      // Rollback ידני - מחיקת הספרים שנוצרו
      console.error('Operation failed, performing manual rollback:', operationError);

      try {
        if (firstBook) {
          await DictaBook.findByIdAndDelete(firstBook._id);
          console.log('Rolled back: deleted first book');
        }
        if (secondBook) {
          await DictaBook.findByIdAndDelete(secondBook._id);
          console.log('Rolled back: deleted second book');
        }
        // אם הספר המקורי נמחק, לא ניתן לשחזר אותו - זה לא אמור לקרות
        // כי המחיקה היא הפעולה האחרונה
        if (originalDeleted) {
          console.error('CRITICAL: Original book was deleted but operation failed');
        }
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
      }

      throw operationError;
    }

  } catch (error) {
    console.error('Error splitting book:', error);
    return NextResponse.json({ 
      error: error.message || 'שגיאה בפיצול הספר' 
    }, { status: 500 });
  }
}
