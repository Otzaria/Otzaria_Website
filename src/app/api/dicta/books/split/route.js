import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DictaBook from '@/models/DictaBook';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
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

    // יצירת הספר הראשון - שומר את הסטטוס והבעלות של הספר המקורי
    const firstBook = await DictaBook.create({
      title: firstBookTitle,
      content: firstContent,
      status: originalBook.status, // שומר את הסטטוס המקורי
      claimedBy: originalBook.claimedBy, // שומר את הבעלות המקורית
      claimedAt: originalBook.claimedAt, // שומר את תאריך התפיסה
      history: [{
        timestamp: new Date(),
        description: `נוצר מפיצול של "${originalBook.title}" (חלק ראשון)`,
        editorId: session.user._id || session.user.id,
        editorName: session.user.name
      }]
    });

    // יצירת הספר השני - תמיד פנוי
    const secondBook = await DictaBook.create({
      title: secondBookTitle,
      content: secondContent,
      status: 'available', // תמיד פנוי
      history: [{
        timestamp: new Date(),
        description: `נוצר מפיצול של "${originalBook.title}" (חלק שני)`,
        editorId: session.user._id || session.user.id,
        editorName: session.user.name
      }]
    });

    // מחיקת הספר המקורי
    await DictaBook.findByIdAndDelete(bookId);

    return NextResponse.json({ 
      success: true, 
      firstBookId: firstBook._id,
      secondBookId: secondBook._id,
      message: `הספר פוצל בהצלחה ל-2 ספרים חדשים`
    });

  } catch (error) {
    console.error('Error splitting book:', error);
    return NextResponse.json({ 
      error: error.message || 'שגיאה בפיצול הספר' 
    }, { status: 500 });
  }
}
