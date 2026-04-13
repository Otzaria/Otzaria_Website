import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

// שמירת תוכן (Auto-save)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { 
        pageNumber, 
        content, 
        leftColumn, 
        rightColumn, 
        twoColumns,
        rightColumnName, 
        leftColumnName 
    } = body;

    const userId = session.user._id || session.user.id;
    const isAdmin = session.user.role === 'admin';

    await connectDB();

    let query = {};
    
    // ניסיון למצוא את העמוד לפי ID ישיר אם סופק
    if (body.pageId) {
        query = { _id: body.pageId };
    } 
    // אחרת, חיפוש לפי נתיב הספר ומספר העמוד
    else if (body.bookPath) {
        const decodedPath = decodeURIComponent(body.bookPath);
        
        const book = await Book.findOne({ 
            $or: [{ slug: decodedPath }, { name: decodedPath }] 
        });
        
        if (!book) throw new Error(`Book not found: ${decodedPath}`);
        query = { book: book._id, pageNumber: pageNumber };
    } else {
        throw new Error('Missing book identifier');
    }

    // שליפת העמוד הנוכחי לבדיקת הרשאות לפני עדכון
    const currentPage = await Page.findOne(query);
    if (!currentPage) return NextResponse.json({ success: false, error: 'Page not found' }, { status: 404 });

    // לוגיקת הרשאות ועדכון סטטוס:
    let updateFields = {
        content,
        isTwoColumns: twoColumns,
        rightColumn,
        leftColumn,
        rightColumnName,
        leftColumnName,
    };

    // 1. אם הדף פנוי - המשתמש "תופס" אותו אוטומטית מעצם השמירה
    if (currentPage.status !== 'available') {
        const isOwner = currentPage.claimedBy?.toString() === userId;
        if (!isOwner && !isAdmin) {
            return NextResponse.json({ success: false, error: 'אין לך הרשאה לערוך דף זה' }, { status: 403 });
        }
        // אם הדף Completed, אנחנו מאפשרים עריכה (תיקון טעויות) מבלי לשנות סטטוס, אלא אם נרצה אחרת.
        // הבקשה הייתה לאפשר עריכה "בלי להגדיר את הדף חזרה למצב עריכה", ולכן לא משנים את הסטטוס כאן.
    }

    // ביצוע העדכון
    const updatedPage = await Page.findOneAndUpdate(
      query,
      updateFields,
      { returnDocument: 'after' }
    );

    if (!updatedPage) {
      return NextResponse.json({ success: false, message: 'העמוד לא נמצא' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'נשמר בהצלחה', pageStatus: updatedPage.status });
  } catch (error) {
    console.error('Save Content Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// שליפת תוכן (טעינה בעת פתיחת העורך)
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        // מאפשרים כניסה רק למחוברים, אך הבדיקה הפרטנית תהיה למטה
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const userId = session.user._id || session.user.id;
        const isAdmin = session.user.role === 'admin';

        const { searchParams } = new URL(request.url);
        const bookPath = searchParams.get('bookPath');
        const pageNumber = searchParams.get('pageNumber');

        if (!bookPath || !pageNumber) {
            return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
        }

        await connectDB();

        const decodedPath = decodeURIComponent(bookPath);

        const book = await Book.findOne({ 
            $or: [{ slug: decodedPath }, { name: decodedPath }] 
        });

        if (!book) {
            return NextResponse.json({ success: false, error: 'Book not found' }, { status: 404 });
        }

        const page = await Page.findOne({ 
            book: book._id, 
            pageNumber: parseInt(pageNumber) 
        });

        if (!page) {
            return NextResponse.json({ success: false, error: 'Page not found' }, { status: 404 });
        }

        // --- בדיקת הרשאות צפייה/עריכה ---
        
        // 1. דף פנוי (Available) - כולם יכולים להיכנס
        if (page.status === 'available') {
            // הגישה מותרת
        }
        // 2. דף בטיפול (In-Progress) - רק הבעלים והמנהלים
        else if (page.status === 'in-progress') {
            const isOwner = page.claimedBy?.toString() === userId;
            if (!isOwner && !isAdmin) {
                return NextResponse.json({ success: false, error: 'הדף נמצא בטיפול על ידי משתמש אחר' }, { status: 403 });
            }
        }
        // 3. דף הושלם (Completed) - רק הבעלים והמנהלים (לצורך תיקונים)
        else if (page.status === 'completed') {
            const isOwner = page.claimedBy?.toString() === userId;
            if (!isOwner && !isAdmin) {
                return NextResponse.json({ success: false, error: 'הדף הושלם על ידי משתמש אחר ונעול לעריכה' }, { status: 403 });
            }
        }

        // 3. החזרת הנתונים ללקוח
        return NextResponse.json({ 
            success: true, 
            data: {
                id: page._id, // חשוב להחזיר ID לשימוש ב-Update
                content: page.content || '',
                isTwoColumns: page.isTwoColumns || false,
                twoColumns: page.isTwoColumns || false,
                rightColumn: page.rightColumn || '',
                leftColumn: page.leftColumn || '',
                rightColumnName: page.rightColumnName || 'חלק 1',
                leftColumnName: page.leftColumnName || 'חלק 2',
                status: page.status,
                claimedBy: page.claimedBy
            }
        });

    } catch (error) {
        console.error('Get Content Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}